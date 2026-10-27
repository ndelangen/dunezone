# Convex usage

The [Convex usage workflow](../../.github/workflows/convex-usage.yml) runs daily at 06:23 UTC and
can be dispatched from main. It reads production and cloud dev separately, writes a step summary,
and retains the counters and report as the `convex-usage-report` artifact for 90 days. It never
exports records, runs migrations or resets data.

The CLI accepts only `--capture production`, `--capture development` and `--report`. It writes fixed files under `usage/` and reads the previous baseline from `previous/report.json`. CLI arguments cannot choose filesystem paths.

The next run downloads the latest saved main-branch report as its baseline. It computes I/O and
call growth separately for each deployment, and normalizes I/O growth to 24 hours using the actual
interval. The first capture, a new calendar month, a changed deployment or reset counters has no
comparable daily baseline. A collection or notification failure does not replace the baseline.

## Windows and thresholds

The CLI reports provider calendar-day and calendar-month counters. The dashboard's billing cycle
is a different window. The report covers Dune Zone production and cloud dev, not every project on
the team. It must not be presented as an invoice or as the team's remaining billing allowance.

`CONVEX_IO_REFERENCE_GB` sets the combined calendar-month I/O reference, default 1 GB. New crossings
at 75%, 90% and 100% create or extend one open GitHub issue with the `convex-usage` label.
`CONVEX_IO_DAILY_ALERT_GB` sets the per-deployment burst threshold, default 0.1 GB per 24 hours.
Both are repository variables. These thresholds are alerts; they do not pause deployments.

The saved report records active conditions. An unchanged condition produces no new issue comment.
A higher reference band or a fresh daily burst produces a new alert. A failed collection opens one issue with the `convex-usage-collection` label, even if a threshold issue is already open. A successful collection and delivery closes that failure issue. Failed workflow runs remain visible in Actions. GitHub's schedule can be delayed or dropped, so check the report's timestamp and
baseline interval when investigating a gap.

## Function attribution

Each deployment capture samples at most 1,000 recent completed executions from the last 24 hours.
The report shows its actual start and end timestamps. It retains function names, call counts and
reported database I/O read and write bytes. It discards application log text, arguments and return
values. The streaming child has a 15-second deadline and a 16 MiB output bound.

The sample is not a complete daily breakdown. Parent and component function counters are shown as
the provider reports them and are never summed into the provider's deployment total. An empty
sample is shown as unavailable, not as proof that the deployment did no work.

Open the named deployment's Usage and Insights pages to trace a new burst. Compare prod and dev
before changing code. The weekly anonymised export and dev refresh can explain a scheduled burst.
Ordinary releases should preserve dev's records and skip completed migrations.

## Read regression budgets

The publication jobs dashboard reads `publication_job_listings`, which contains queue metadata without
render payloads. An aggregate maintains exact counts and numbered-page offsets for every status and
Asset type. Job writes maintain both in the same transaction. A 1,101-job fixture keeps a deep filtered
25-row page under 128 KiB; the rollout fallback fails that same budget because it reads render payloads.

The additive `publication_job_listings_v1` backfill copies existing job metadata. Its verifier checks
each remaining job and both aggregate entries before the dashboard switches from the original query.
Neither migration changes source job payloads, status, attempts or publication settings. Production
execution requires confirmation under the production-write policy. To recover, deploy the original
page reader while retaining the listing table, write triggers and aggregate component.

After production backfill and live publishing measurements confirm the read budget, remove the legacy
reader and readiness fallback in a separate cleanup PR. Keep migration replay and snapshot loading
compatible with the derived listing.

`convex/assets.boardListings.test.ts` caps backend reads at 64 KiB for listings with real Arrakis
geometry, including a ten-board catalogue. It covers asset landing, numbered catalogue, legacy
browse, asset picker, FAQ board picker and ruleset board slots. It verifies that a full definition
fails that same budget.

`convex/rulebooks.reader.test.ts` caps published-reader metadata at 16 KiB with enlarged Edition
Contents and verifies that the full-content read fails the budget. The isolated release rehearsal
covers ready HTML and historical fallback; production smoke makes one published-reader request.

Review the first seven daily reports after deployment. Confirm ordinary releases no longer replay
completed dev migrations, published readers use their HTML artifacts, and production/dev growth
matches expected editing and publishing activity. Adjust alert thresholds from that evidence.
