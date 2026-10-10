#!/usr/bin/env bash
# Copies each file in $FILES to the same relative path under the record directory, beside .ci-pass/run-url,
# so prior-pass can unzip the record straight into the workspace.
set -euo pipefail

record="$RUNNER_TEMP/ci-pass-record"
rm -rf "$record"
mkdir -p "$record/.ci-pass"
echo "$RUN_URL" > "$record/.ci-pass/run-url"
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  # A report the run did not write is left out, as its own coverage upload left it out, so a reuse uploads what this run did.
  if [[ ! -f "$file" ]]; then
    echo "::warning::$file was to be recorded but does not exist, so the record carries no copy of it."
    continue
  fi
  mkdir -p "$record/$(dirname "$file")"
  cp "$file" "$record/$file"
done <<< "$FILES"
