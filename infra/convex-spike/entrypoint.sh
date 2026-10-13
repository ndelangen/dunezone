#!/bin/bash
# Container start for the #2078 spike.
# 1. Refuse to start when any setting is missing.
# 2. Restore the database from the generation the Durable Object names, unless that is generation 0.
#    A named generation must restore; an empty or unreadable replica stops the start rather than serving an empty database.
# 3. Run the backend under Litestream, replicating to this start's own generation.
# 4. Mark the container ready only after Litestream's first upload to R2; give up after READY_TIMEOUT_SECONDS.
# 5. Watch replication: Litestream attempts a sync every second, so a sync count that stops moving for STALL_SECONDS
#    means its loop is stuck; stop gracefully so the Durable Object starts a new generation from what was replicated.
#    Comparing the WAL's mtime with the txid instead restarted an idle container every few minutes, because checkpoints touch the WAL.
# Lifecycle events go to R2 under events/gen-N/ so overlapping containers can be compared afterwards.
set -euo pipefail
# A rollout signals every process, not just PID 1. If tee died with it, Litestream's next log line would hit a
# closed pipe and Go would exit on SIGPIPE before the final flush, so tee ignores those signals and ends at EOF.
exec > >(trap '' TERM INT PIPE; exec tee -a /tmp/spike.log) 2>&1

DB=/data/convex.sqlite3
READY_FILE=/tmp/replica-ready
READY_TIMEOUT_SECONDS=${READY_TIMEOUT_SECONDS:-120}
STALL_SECONDS=${STALL_SECONDS:-15}

now() { date -u +%Y-%m-%dT%H:%M:%S.%3NZ; }
log() { echo "[spike gen=${GENERATION:-?} rev=${IMAGE_REVISION:-?}] $(now) $*"; }

required=(GENERATION RESTORE_GENERATION INSTANCE_NAME INSTANCE_SECRET CONVEX_ORIGIN CONVEX_SITE
  S3_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION LITESTREAM_BUCKET LITESTREAM_SYNC_INTERVAL
  S3_STORAGE_EXPORTS_BUCKET S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET S3_STORAGE_MODULES_BUCKET
  S3_STORAGE_FILES_BUCKET S3_STORAGE_SEARCH_BUCKET)
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    log "missing setting $name; refusing to start"
    exit 64
  fi
done

# Bash as PID 1 ignores SIGTERM without a handler, so the handler is installed before any long step.
child=
helpers=()
stopping=0
on_term() {
  stopping=1
  log "SIGTERM; forwarding to ${child:-nothing}"
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null || true
  for helper in "${helpers[@]}"; do kill "$helper" 2>/dev/null || true; done
}
trap on_term TERM INT

# One small object per lifecycle event. The shim takes the access key as this generation's token.
event() {
  local key="events/gen-${GENERATION}/$(date -u +%Y%m%dT%H%M%S.%3NZ)-$1"
  curl -fsS --max-time 10 -X PUT --data-binary "at=$(now) rev=${IMAGE_REVISION} $2" \
    -H "x-spike-token: ${AWS_ACCESS_KEY_ID}" \
    "${S3_ENDPOINT_URL}/${LITESTREAM_BUCKET}/${key}" >/dev/null || log "event $1 not recorded"
}

boot_ms=$(date +%s%3N)
log "start; restore from gen-${RESTORE_GENERATION}"
event start "restore_from=${RESTORE_GENERATION}"

mkdir -p /data
rm -f "$READY_FILE"
if [ "$RESTORE_GENERATION" != "0" ] && [ ! -f "$DB" ]; then
  restore_started=$(date +%s%3N)
  timeout "${RESTORE_TIMEOUT_SECONDS:-300}" litestream restore -config /etc/litestream/litestream-restore.yml "$DB" &
  child=$!
  set +e
  wait "$child"
  code=$?
  [ "$stopping" = 1 ] && { wait "$child"; exit 143; }
  set -e
  child=
  restore_ms=$(( $(date +%s%3N) - restore_started ))
  size=$(stat -c %s "$DB" 2>/dev/null || echo 0)
  if [ "$code" != 0 ] || [ "$size" -lt 65536 ]; then
    log "restore of gen-${RESTORE_GENERATION} failed (exit ${code}, ${size} bytes) after ${restore_ms} ms"
    event restore-failed "code=${code} bytes=${size} ms=${restore_ms}"
    exit 70
  fi
  log "restored ${size} bytes in ${restore_ms} ms"
  event restored "ms=${restore_ms} bytes=${size}"
fi
[ "$stopping" = 1 ] && exit 143

litestream replicate -config /etc/litestream/litestream-replicate.yml -exec "convex-local-backend \
  --interface 0.0.0.0 --port 3210 --site-proxy-port 3211 \
  --convex-origin ${CONVEX_ORIGIN} --convex-site ${CONVEX_SITE} \
  --instance-name ${INSTANCE_NAME} --instance-secret ${INSTANCE_SECRET} \
  --s3-storage --disable-beacon ${DB}" &
child=$!

sync_count() { curl -fsS --max-time 2 http://127.0.0.1:9090/metrics 2>/dev/null | sed -n 's/^litestream_sync_count{[^}]*} //p'; }

# Readiness gate, then the replication watchdog.
(
  trap - TERM INT
  deadline=$(( $(date +%s) + READY_TIMEOUT_SECONDS ))
  until litestream ltx -config /etc/litestream/litestream-replicate.yml "$DB" 2>/dev/null | grep -qE '[0-9a-f]{16}[[:space:]]+[0-9a-f]{16}' \
    && curl -fsS --max-time 2 http://127.0.0.1:3210/version >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "no replica upload within ${READY_TIMEOUT_SECONDS}s; stopping"
      event not-ready ""
      kill -TERM 1
      exit 1
    fi
    sleep 0.5
  done
  ready_ms=$(( $(date +%s%3N) - boot_ms ))
  touch "$READY_FILE"
  log "ready after ${ready_ms} ms (first replica upload done)"
  event ready "ms=${ready_ms}"

  last_count=$(sync_count)
  last_move=$(date +%s)
  while sleep 5; do
    current=$(sync_count)
    if [ -n "$current" ] && [ "$current" != "$last_count" ]; then
      last_count=$current
      last_move=$(date +%s)
      continue
    fi
    if [ $(( $(date +%s) - last_move )) -ge "$STALL_SECONDS" ]; then
      log "replication stalled: sync count ${last_count} unchanged since ${last_move}; stopping"
      event stalled "sync_count=${last_count}"
      rm -f "$READY_FILE"
      kill -TERM 1
      exit 1
    fi
  done
) &
helpers+=($!)

set +e
wait "$child"
code=$?
# A trapped signal interrupts the first wait; wait again for Litestream's final flush.
if [ "$stopping" = 1 ]; then
  wait "$child"
  code=$?
fi
for helper in "${helpers[@]}"; do kill "$helper" 2>/dev/null || true; done
log "Litestream exited with ${code}"
event exited "code=${code}"
exit "$code"
