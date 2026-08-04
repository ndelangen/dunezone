#!/usr/bin/env bash

set -euo pipefail

remote_name=""
for candidate in real-origin origin; do
  if git remote get-url "$candidate" >/dev/null 2>&1; then
    remote_name="$candidate"
    break
  fi
done

if [[ -z "$remote_name" ]]; then
  remote_name="$(git remote | sed -n '1p')"
fi

if [[ -z "$remote_name" ]]; then
  echo "Worktree preflight failed: this repository has no Git remote." >&2
  exit 1
fi

echo "Fetching $remote_name before checking the worktree base..."
git fetch --prune "$remote_name"

remote_head="$(git symbolic-ref --quiet --short "refs/remotes/$remote_name/HEAD" || true)"
if [[ -z "$remote_head" ]] && git show-ref --verify --quiet "refs/remotes/$remote_name/main"; then
  remote_head="$remote_name/main"
fi

if [[ -z "$remote_head" ]]; then
  echo "Worktree preflight failed: could not determine the default branch for $remote_name." >&2
  exit 1
fi

current_head="$(git rev-parse HEAD)"
latest_head="$(git rev-parse "$remote_head")"

if [[ "$current_head" == "$latest_head" ]]; then
  echo "Worktree base is current at $remote_head ($latest_head)."
  exit 0
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Worktree preflight failed: the checkout is stale and contains local changes." >&2
  echo "Refusing to move HEAD from $current_head to $remote_head ($latest_head)." >&2
  exit 1
fi

if git symbolic-ref --quiet --short HEAD >/dev/null; then
  echo "Worktree preflight failed: the stale checkout is attached to a branch." >&2
  echo "Refusing to mutate that branch; update it explicitly before continuing." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$current_head" "$latest_head"; then
  echo "Worktree preflight failed: HEAD has diverged from $remote_head." >&2
  echo "Select the intended up-to-date base branch and create a new worktree." >&2
  exit 1
fi

git switch --detach "$remote_head"
echo "Advanced worktree base from $current_head to $remote_head ($latest_head)."
