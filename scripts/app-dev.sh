#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--local" ]]; then
  TEMPORARY_ROOT="${TMPDIR:-/tmp}"
  LOCAL_DEV_TEMPORARY_DIRECTORY="$(mktemp -d "${TEMPORARY_ROOT%/}/dunezone-app-dev.XXXXXX")"
  CLEANUP_LOG_FILE="$LOCAL_DEV_TEMPORARY_DIRECTORY/cleanup.log"
  export LOCAL_DEV_OWNER_PID="$$"
  export LOCAL_DEV_RESERVATION_TOKEN="$LOCAL_DEV_TEMPORARY_DIRECTORY/reservation-token"
  export LOCAL_DEV_TEMPORARY_DIRECTORY
  WORKER_PID=""
  PENDING_SIGNAL=""
  WORKER_SHUTDOWN_SIGNAL_SENT=""

  forward_signal() {
    local signal="$1"
    PENDING_SIGNAL="$signal"
    if [[ -n "$WORKER_PID" ]] && kill -s "$signal" -- "-$WORKER_PID" 2>/dev/null; then
      WORKER_SHUTDOWN_SIGNAL_SENT="$signal"
    fi
  }

  drain_worker_group() {
    if [[ -z "$WORKER_PID" ]] || ! kill -0 -- "-$WORKER_PID" 2>/dev/null; then
      return 0
    fi
    if [[ -z "$WORKER_SHUTDOWN_SIGNAL_SENT" ]] && kill -s TERM -- "-$WORKER_PID" 2>/dev/null; then
      WORKER_SHUTDOWN_SIGNAL_SENT="TERM"
    fi
    for _ in {1..50}; do
      if ! kill -0 -- "-$WORKER_PID" 2>/dev/null; then
        return 0
      fi
      sleep 0.1
    done
    kill -s KILL -- "-$WORKER_PID" 2>/dev/null || true
  }

  run_cleanup() {
    (
      trap - INT TERM
      exec bun "$ROOT_DIR/scripts/local-dev-cleanup.ts"
    ) >"$CLEANUP_LOG_FILE" 2>&1 &
    local cleanup_pid=$!
    for _ in {1..450}; do
      if ! kill -0 "$cleanup_pid" 2>/dev/null; then
        local cleanup_status=0
        wait "$cleanup_pid" 2>/dev/null || cleanup_status=$?
        if (( cleanup_status != 0 )); then
          cat "$CLEANUP_LOG_FILE" >&2
        fi
        return "$cleanup_status"
      fi
      sleep 0.1
    done
    kill -s TERM "$cleanup_pid" 2>/dev/null || true
    for _ in {1..50}; do
      if ! kill -0 "$cleanup_pid" 2>/dev/null; then
        wait "$cleanup_pid" 2>/dev/null || true
        cat "$CLEANUP_LOG_FILE" >&2
        return 124
      fi
      sleep 0.1
    done
    kill -s KILL "$cleanup_pid" 2>/dev/null || true
    wait "$cleanup_pid" 2>/dev/null || true
    cat "$CLEANUP_LOG_FILE" >&2
    return 124
  }

  cleanup() {
    local original_status=$?
    local cleanup_status=0
    trap - EXIT
    trap '' INT TERM
    drain_worker_group
    if [[ -n "$WORKER_PID" ]]; then
      wait "$WORKER_PID" 2>/dev/null || true
    fi
    if run_cleanup; then
      cleanup_status=0
    else
      cleanup_status=$?
    fi
    rm -rf -- "$LOCAL_DEV_TEMPORARY_DIRECTORY"
    if (( cleanup_status != 0 )); then
      printf 'Local Convex cleanup failed with status %s.\n' "$cleanup_status" >&2
      if (( original_status == 0 )); then
        exit "$cleanup_status"
      fi
    fi
  }
  trap 'forward_signal INT' INT
  trap 'forward_signal TERM' TERM
  trap cleanup EXIT

  set -m
  bun "$ROOT_DIR/scripts/app-dev.ts" "$@" &
  WORKER_PID=$!
  set +m
  if [[ -n "$PENDING_SIGNAL" ]]; then
    if [[ -z "$WORKER_SHUTDOWN_SIGNAL_SENT" ]]; then
      forward_signal "$PENDING_SIGNAL"
    fi
    drain_worker_group
  fi

  set +e
  while true; do
    wait "$WORKER_PID"
    WORKER_STATUS=$?
    if [[ -n "$PENDING_SIGNAL" ]]; then
      drain_worker_group
    fi
    if ! kill -0 "$WORKER_PID" 2>/dev/null; then
      break
    fi
  done
  set -e
  if [[ "$PENDING_SIGNAL" == "INT" ]]; then
    exit 130
  fi
  if [[ "$PENDING_SIGNAL" == "TERM" ]]; then
    exit 143
  fi
  exit "$WORKER_STATUS"
fi

exec bun "$ROOT_DIR/scripts/app-dev.ts" "$@"
