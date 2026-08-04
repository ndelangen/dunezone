#!/usr/bin/env bash

set -u

repository_root="$(git rev-parse --show-toplevel)"
preflight_output="$(bash "$repository_root/scripts/codex-worktree-setup.sh" 2>&1)"
preflight_status=$?

if [[ $preflight_status -eq 0 ]]; then
  printf '%s\n' "$preflight_output"
  exit 0
fi

printf '%s\n' "$preflight_output" >&2
printf '%s\n' '{"continue":false,"stopReason":"Worktree freshness preflight failed. Resolve the reported Git state before editing.","systemMessage":"This Codex session was stopped because its worktree base could not be updated safely."}'
