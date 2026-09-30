#!/usr/bin/env bash
# The hosted play summary table, run by action.yml beside this file from the repository root.
# Its inputs arrive as HEADING, SHARD and PROTOCOL_VERIFIER in the environment.
#
# One row for each of the shard's flows, and one for the protocol verifier where it runs, even
# when the run stopped before reaching them. A flow the launcher stops at its budget still
# writes a report, failed after its last check. Renderer and Chromium come from the report:
# the renderer kind its first table drew with, and the Chromium build that ran it. Play at is the
# flow's seconds to Turn 1 from the report's milestones, blank for a flow that never reached it.
# A failed flow's report names only the checks that passed, so its failing step is the source line
# the driver recorded for the error and the check it passed last. The error is the report's message
# on one line: an assertion's first line only says what kind of comparison failed.
# A failed flow lookup writes its own row and fails the step, as does a report jq cannot read.
# The table also goes to the job log, so a shard's rows can be read without the run page.

# -e, as GitHub's bash shell sets it for a run: script.
# pipefail keeps a jq failure inside the table failing the step through tee.
set -eo pipefail
out=test-results/hosted-play
flow_list="$(bun -e 'import { flowsInShard } from "./scripts/verify-hosted-flows.ts"; console.log(flowsInShard(process.argv[1]).join(" "))' "$SHARD")" || flow_list=''
read -r -a flows <<< "$flow_list"
{
  echo "### ${HEADING}"
  echo
  echo '| Flow | Result | Seconds | Play at (s) | Renderer | Chromium | Failing step | Error |'
  echo '| --- | --- | --- | --- | --- | --- | --- | --- |'
  if [ "$PROTOCOL_VERIFIER" = true ]; then
    if grep -qs '"status": "passed"' "$out/verification.log"; then
      echo '| protocol verifier | pass | | | | | | |'
    elif [ -f "$out/verification.log" ]; then
      echo '| protocol verifier | fail | | | | | | see verification.log |'
    else
      echo '| protocol verifier | did not run | | | | | | see the run step |'
    fi
  fi
  if [ "${#flows[@]}" -eq 0 ]; then
    echo "| ${SHARD} flows | not listed | | | | | | the flow lookup in this step failed |"
  fi
  for flow in "${flows[@]}"; do
    if [ ! -f "$out/$flow.log" ]; then
      echo "| $flow | did not run | | | | | | see the run step |"
      continue
    fi
    report=''
    for candidate in "$out/browser/$flow"-*/report.json; do
      if [ -f "$candidate" ]; then
        report="$candidate"
      fi
    done
    if [ -z "$report" ]; then
      echo "| $flow | no report | | | | | | see $flow.log |"
      continue
    fi
    jq -r 'def seconds: sub("\\.[0-9]+Z$"; "Z") | fromdate;
      def cell: gsub("\\|"; "/");
      def step: [(.at // "" | [match("(scripts/)?verify-hosted-[^/:() ]+:[0-9]+").string][0]), "after \"\(.afterCheck)\""]
        | map(select(. != null)) | join(", ");
      def message: .message // "" | [splits("\\s+")] | map(select(length > 0)) | join(" ")
        | if length > 200 then .[:197] + "..." else . end;
      "| \(.flow) | \(if .failure then "fail" else "pass" end) | \((.finishedAt | seconds) - (.startedAt | seconds)) | \(.milestones.play // "") | \(.renderer.kind // "not read") | \(.chromium.build // "") | \(if .failure then .failure | step | cell else "" end) | \(if .failure then .failure | message | cell else "" end) |"' "$report"
  done
} | tee -a "$GITHUB_STEP_SUMMARY"
test "${#flows[@]}" -gt 0
