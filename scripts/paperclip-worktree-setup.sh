#!/usr/bin/env bash

set -euo pipefail

expected_path="${PAPERCLIP_WORKSPACE_WORKTREE_PATH:?Paperclip must supply its task worktree path.}"
expected_branch="${PAPERCLIP_WORKSPACE_BRANCH:?Paperclip must supply its task branch.}"
repository_root="$(git rev-parse --show-toplevel)"
actual_path="$(pwd -P)"
expected_path="$(cd "$expected_path" && pwd -P)"
repository_root="$(cd "$repository_root" && pwd -P)"
actual_branch="$(git symbolic-ref --quiet --short HEAD || true)"

if [[ "$actual_path" != "$repository_root" || "$actual_path" != "$expected_path" ]]; then
  echo "Paperclip preflight failed: the current directory is not the expected task worktree." >&2
  exit 1
fi

case "$expected_branch" in
  norbert/paperclip-*) ;;
  *)
    echo "Paperclip preflight failed: the task branch must start with norbert/paperclip-." >&2
    exit 1
    ;;
esac

if [[ "$actual_branch" != "$expected_branch" ]]; then
  echo "Paperclip preflight failed: expected branch $expected_branch, found ${actual_branch:-detached HEAD}." >&2
  exit 1
fi

bash ./scripts/codex-worktree-setup.sh
bun install --frozen-lockfile

if [[ ! -f src/game/data/assetMap.generated.ts ]]; then
  bun run generate:images
fi
if [[ ! -d public/vector ]]; then
  bun run generate:vectors
fi
if [[ ! -d public/obj ]]; then
  bun run generate:objs
fi
