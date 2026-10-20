#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" != "--local" ]]; then
  exec bun "$ROOT_DIR/scripts/app-dev.ts" "$@"
fi

# The OS lock covers the entire supervisor, including service shutdown in its EXIT trap.
# Python's standard-library flock works on macOS and Linux and releases after a crash/reboot.
PERSIST_DIRECTORY=""
EXPECT_PERSIST_DIRECTORY=0
for argument in "$@"; do
  if (( EXPECT_PERSIST_DIRECTORY )); then
    PERSIST_DIRECTORY="$argument"
    EXPECT_PERSIST_DIRECTORY=0
  elif [[ "$argument" == "--persist-dir" ]]; then
    EXPECT_PERSIST_DIRECTORY=1
  elif [[ "$argument" == --persist-dir=* ]]; then
    PERSIST_DIRECTORY="${argument#--persist-dir=}"
  fi
done
if [[ -n "$PERSIST_DIRECTORY" && -z "${LOCAL_DEV_OS_LOCK:-}" ]]; then
  exec python3 "$ROOT_DIR/scripts/local-dev-lock.py" "$PERSIST_DIRECTORY" /bin/bash "$ROOT_DIR/scripts/app-dev.sh" "$@"
fi

LOCAL_DEV_TEMPORARY_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/dunezone-app-dev.XXXXXXXX")"
export LOCAL_DEV_TEMPORARY_DIRECTORY
WORKER_PID=""
SIGNAL_STATUS=0

stop() {
  SIGNAL_STATUS="$1"
  if [[ -n "$WORKER_PID" ]]; then exit "$SIGNAL_STATUS"; fi
}

cleanup() {
  local status=$?
  trap - EXIT
  trap '' INT TERM
  if [[ -n "$WORKER_PID" ]]; then
    # Provisioning can block in a child command; stop the entire launch process group.
    kill -s TERM -- "-$WORKER_PID" 2>/dev/null || true
    for _ in {1..50}; do
      if ! kill -0 -- "-$WORKER_PID" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    kill -s KILL -- "-$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  if ! bun --no-env-file "$ROOT_DIR/scripts/local-dev-cleanup.ts"; then
    printf 'Local cleanup failed. Run the cleanup command printed at startup.\n' >&2
    if (( status == 0 )); then status=1; fi
  fi
  rm -rf -- "$LOCAL_DEV_TEMPORARY_DIRECTORY"
  exit "$status"
}
trap cleanup EXIT
trap 'stop 130' INT
trap 'stop 143' TERM

# Job control gives the worker and its descendants a group separate from this supervisor.
set -m
bun "$ROOT_DIR/scripts/app-dev.ts" "$@" &
WORKER_PID=$!
set +m
if (( SIGNAL_STATUS != 0 )); then exit "$SIGNAL_STATUS"; fi
wait "$WORKER_PID"
