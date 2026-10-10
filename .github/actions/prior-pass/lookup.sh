#!/usr/bin/env bash
# Restores the newest unexpired record named $NAME that a run of this repository's own branches uploaded,
# and writes reuse=true; anything else, an API error included, writes reuse=false so the job runs in full.
set -uo pipefail

run_in_full() {
  echo "reuse=false" >> "$GITHUB_OUTPUT"
  echo "The job runs in full: $1"
  printf '### Runs in full\n\n%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  exit 0
}

if [[ "$EVENT" != pull_request ]]; then
  run_in_full "only pull request runs reuse an earlier pass; this is a $EVENT run."
fi

listing="$RUNNER_TEMP/prior-pass.json"
if ! gh api "repos/$REPO/actions/artifacts?name=$NAME&per_page=20" > "$listing"; then
  run_in_full "the earlier records could not be listed."
fi

# A fork's run uploads from code nobody reviewed, so only records from this repository's own branches count.
id="$(jq -r '[.artifacts[] | select(.expired == false and .workflow_run.head_repository_id == .workflow_run.repository_id)][0].id // empty' "$listing")"
if [[ -z "$id" ]]; then
  run_in_full "no earlier run passed this job with the same inputs ($NAME)."
fi

archive="$RUNNER_TEMP/prior-pass.zip"
if ! gh api "repos/$REPO/actions/artifacts/$id/zip" > "$archive" || ! unzip -o -q "$archive" -d "$GITHUB_WORKSPACE"; then
  run_in_full "the earlier record $id could not be restored."
fi

passed="$(cat "$GITHUB_WORKSPACE/.ci-pass/run-url" 2>/dev/null || echo "an earlier run")"
echo "reuse=true" >> "$GITHUB_OUTPUT"
echo "Reused: $passed passed this job with the same inputs."
printf '### Reused an earlier pass\n\n%s passed this job with the same inputs (%s), so its checks are not run again and its recorded coverage is uploaded.\n' "$passed" "$NAME" >> "$GITHUB_STEP_SUMMARY"
