#!/usr/bin/env bash
# Restores the newest unexpired record named $NAME that a run of this repository's own branches uploaded,
# and writes reuse=true; anything else, an API error included, writes reuse=false so the job runs in full.
# The answer also goes to CI_PASS_REUSE in the job's environment, where record-pass reads it.
set -uo pipefail

listing="$RUNNER_TEMP/prior-pass.json"
archive="$RUNNER_TEMP/prior-pass.zip"
reuse=false
if [[ "$EVENT" != pull_request ]]; then
  why="only pull request runs reuse an earlier pass; this is a $EVENT run."
elif ! gh api "repos/$REPO/actions/artifacts?name=$NAME&per_page=20" > "$listing"; then
  why="the earlier records could not be listed."
else
  # A fork's run uploads from code nobody reviewed, so only records from this repository's own branches count.
  id="$(jq -r '[.artifacts[] | select(.expired == false and .workflow_run.head_repository_id == .workflow_run.repository_id)][0].id // empty' "$listing")"
  if [[ -z "$id" ]]; then
    why="no earlier run passed this job with the same inputs ($NAME)."
  elif ! gh api "repos/$REPO/actions/artifacts/$id/zip" > "$archive" || ! unzip -o -q "$archive" -d "$GITHUB_WORKSPACE"; then
    why="the earlier record $id could not be restored."
  else
    reuse=true
    passed="$(cat "$GITHUB_WORKSPACE/.ci-pass/run-url" 2>/dev/null || echo "an earlier run")"
  fi
fi

echo "reuse=$reuse" >> "$GITHUB_OUTPUT"
echo "CI_PASS_REUSE=$reuse" >> "$GITHUB_ENV"
if [[ "$reuse" == true ]]; then
  echo "Reused: $passed passed this job with the same inputs."
  printf '### Reused an earlier pass\n\n%s passed this job with the same inputs (%s), so its checks are not run again and its recorded coverage is uploaded.\n' "$passed" "$NAME" >> "$GITHUB_STEP_SUMMARY"
else
  echo "The job runs in full: $why"
  printf '### Runs in full\n\n%s\n' "$why" >> "$GITHUB_STEP_SUMMARY"
fi
