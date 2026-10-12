#!/bin/bash
# Container start for the #2078 spike.
# 1. Refuse to start when any setting is missing.
# 2. Restore the database from the generation the Durable Object names, unless that is generation 0.
# 3. Run the backend under Litestream, replicating to this start's own generation.
# 4. Mark the container ready only after Litestream's first upload to R2; give up after READY_TIMEOUT_SECONDS.
# Lifecycle events go to R2 under events/gen-N/ so overlapping containers can be compared afterwards.
set -euo pipefail
exec > >(tee -a /tmp/spike.log) 2>&1

DB=/data/convex.sqlite3
READY_FILE=/tmp/replica-ready
READY_TIMEOUT_SECONDS=${READY_TIMEOUT_SECONDS:-120}

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

# One small object per lifecycle event. The endpoint is the Worker's S3 shim, which needs no signature.
event() {
  local key="events/gen-${GENERATION}/$(date -u +%Y%m%dT%H%M%S.%3NZ)-$1"
  curl -fsS --max-time 10 -X PUT --data-binary "at=$(now) rev=${IMAGE_REVISION} $2" \
    "${S3_ENDPOINT_URL}/${LITESTREAM_BUCKET}/${key}" >/dev/null || log "event $1 not recorded"
}

boot_ms=$(date +%s%3N)
log "start; restore from gen-${RESTORE_GENERATION}"
event start "restore_from=${RESTORE_GENERATION}"

# Bash as PID 1 ignores SIGTERM without a handler, so the handler is installed before any long step.
child=
stopping=0
on_term() {
  stopping=1
  log "SIGTERM; forwarding to ${child:-nothing}"
  event sigterm ""
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null || true
}
trap on_term TERM INT

mkdir -p /data
rm -f "$READY_FILE"
if [ "$RESTORE_GENERATION" != "0" ] && [ ! -f "$DB" ]; then
  restore_started=$(date +%s%3N)
  timeout "${RESTORE_TIMEOUT_SECONDS:-300}" litestream restore -config /etc/litestream/litestream-restore.yml -if-replica-exists "$DB" &
  child=$!
  set +e
  wait "$child"
  code=$?
  [ "$stopping" = 1 ] && { wait "$child"; exit 143; }
  set -e
  child=
  restore_ms=$(( $(date +%s%3N) - restore_started ))
  if [ "$code" != 0 ]; then
    log "restore failed with ${code} after ${restore_ms} ms"
    event restore-failed "code=${code} ms=${restore_ms}"
    exit 70
  fi
  size=$(stat -c %s "$DB" 2>/dev/null || echo 0)
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

# Readiness gate: the generation's replica must list at least one LTX file and the backend must answer.
(
  deadline=$(( $(date +%s) + READY_TIMEOUT_SECONDS ))
  until litestream ltx -config /etc/litestream/litestream-replicate.yml "$DB" 2>/dev/null | grep -qE '^[0-9a-f]{16}[[:space:]]+[0-9a-f]{16}' \
    && curl -fsS --max-time 2 http://127.0.0.1:3210/version >/dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "no replica upload within ${READY_TIMEOUT_SECONDS}s; stopping"
      event not-ready ""
      kill -TERM "$child" 2>/dev/null || true
      exit 1
    fi
    sleep 0.5
  done
  ready_ms=$(( $(date +%s%3N) - boot_ms ))
  touch "$READY_FILE"
  log "ready after ${ready_ms} ms (first replica upload done)"
  event ready "ms=${ready_ms}"
) &

set +e
wait "$child"
code=$?
# A trapped signal interrupts the first wait; wait again for Litestream's final flush.
if [ "$stopping" = 1 ]; then
  wait "$child"
  code=$?
fi
log "Litestream exited with ${code}"
event exited "code=${code}"
exit "$code"
