#!/usr/bin/env bash
# The hosted play closure decision (#1598), run by action.yml at the start of each hosted shard.
# The shard runs its flows when this writes run=true to the step's outputs and skips them on run=false.
set -eo pipefail

# The API responses and the file list stay out of the checkout, which the shard goes on to build and run.
script="$GITHUB_WORKSPACE/scripts/hosted-play-closure.ts"
cd "$RUNNER_TEMP"

# The shards run or are skipped, with the reason in the log and on the step summary.
shards_run() {
  echo "run=true" >> "$GITHUB_OUTPUT"
  echo "Hosted play shards run: $1"
  printf '### Hosted play shards run\n\n%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
}
shards_skip() {
  echo "run=false" >> "$GITHUB_OUTPUT"
  echo "Hosted play shards skipped: $1"
  printf '### Hosted play shards skipped\n\n%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
}
# Reads one API path into a file; a reading that fails runs the shards with the reason and ends the step, so no API error fails this step.
read_api() {
  if ! gh api "$1" > "$2"; then
    shards_run "The $3 could not be read from the API, so the shards run."
    exit 0
  fi
}
# The files of a compare response, one per line, into changed-files.txt.
# A renamed file counts under both its names, so a file moved out of the closure still reaches.
# One response carries the files of the whole comparison (paging splits only its commits) and lists at most 300, so a list that long may be cut short and fails this function.
files_of() {
  jq -r '.files[] | .filename, (.previous_filename // empty)' "$1" > changed-files.txt \
    && [ "$(grep -c . changed-files.txt)" -lt 300 ]
}
case "$EVENT" in
  pull_request)
    # Three dots: the files changed since the merge base, so main's own commits do not count.
    if ! gh api "repos/$REPO/compare/$BASE...$HEAD" > compare.json || ! files_of compare.json; then
      shards_run "The changed files could not be read in full from the compare API, so the shards run."
      exit 0
    fi
    # The script writes run=true or run=false to the outputs itself; a script that fails writes nothing and fails the shard.
    bun "$script" < changed-files.txt
    ;;
  schedule | workflow_dispatch)
    if [ "$FORCE" = true ]; then
      shards_run "A dispatch asked for them whatever main's tree had."
      exit 0
    fi
    # The daily run on main: the shards run unless this tree already had them, from the last run of the calling workflow that checked this commit, or from the run of the pull request that merged as this commit when that merge was up to date (the API says ahead) and its diff reached the closure.
    # The calling workflow's file, from owner/repo/.github/workflows/<file>@<ref>.
    workflow="${WORKFLOW_REF#*/.github/workflows/}"
    workflow="${workflow%@*}"
    read_api "repos/$REPO/actions/workflows/$workflow/runs?branch=main&status=success&per_page=1" runs.json "previous runs of $workflow"
    if [ "$(jq -r '.workflow_runs[0].head_sha // empty' runs.json)" = "$SHA" ]; then
      shards_skip "main has not moved since the last $workflow run checked $SHA."
      exit 0
    fi
    read_api "repos/$REPO/commits/$SHA" commit.json "commit at main's tip"
    read -r first second <<< "$(jq -r '[.parents[].sha] | join(" ")' commit.json)"
    if [ -z "${second:-}" ]; then
      shards_run "$SHA is not a merge commit, so no pull request run stands for its tree."
      exit 0
    fi
    read_api "repos/$REPO/compare/$first...$second" compare.json "merged pull request's comparison with main"
    status="$(jq -r .status compare.json)"
    if [ "$status" != ahead ]; then
      shards_run "The pull request that merged as $SHA was not up to date with main ($status), so its run checked another tree."
      exit 0
    fi
    if ! files_of compare.json; then
      shards_run "The merged pull request's files could not be read in full from the compare API, so the shards run."
      exit 0
    fi
    # The script's own output and summary are not wanted here; its decision is read from the JSON it prints.
    decision="$(GITHUB_OUTPUT='' GITHUB_STEP_SUMMARY='' bun "$script" < changed-files.txt)"
    if [ "$(jq .run <<< "$decision")" = true ]; then
      shards_skip "The pull request that merged as $SHA was up to date and its diff reached the closure, so its run executed the shards on this tree."
    else
      shards_run "The pull request that merged as $SHA skipped the shards, so no run has executed them on this tree."
    fi
    ;;
  *)
    shards_run "Every other event runs them; this is a $EVENT run."
    ;;
esac
