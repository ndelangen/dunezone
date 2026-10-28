#!/usr/bin/env bash
set -euo pipefail

# A stalled install consumed 838 s of the unit job's 15-minute limit in #2593.
install_timeout="${BUN_CI_INSTALL_TIMEOUT:-120s}"
for attempt in 1 2 3; do
  echo "Frozen dependency install, attempt $attempt of 3, limit $install_timeout."
  if timeout --kill-after=10s "$install_timeout" bun install --frozen-lockfile --ignore-scripts; then
    exit 0
  else
    status=$?
  fi
  if [[ "$status" -ne 124 || "$attempt" -eq 3 ]]; then
    exit "$status"
  fi
  echo "Dependency install timed out; retrying with the packages already cached."
done
