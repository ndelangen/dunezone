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

The publication jobs dashboard's cursor query reads `publication_job_listings`, which contains queue
metadata without render payloads. Its native indexes preserve status and creation order. The aggregate
provides exact counts and supports offsets for older clients using the numbered-page query. Existing
cursors keep reading their original table through the migration cutover; a new traversal uses metadata
once verification succeeds. Both query contracts have a 128 KiB regression budget.

The [local backend rehearsal](./convex-publication-listing-benchmark.json) used thirty synthetic jobs,
each with a 900,000-byte payload. The current query read 5,401,825 bytes for three rows and a bounded
count; after verification it read 12,127 bytes for twenty-five rows and an exact count. The final five
rows required 7,077 bytes. The old cursor remained usable after cutover.

These savings apply to dashboard reads. Maintaining the listing and aggregate costs writes even when
the dashboard is closed. In the same backend, a small job's insert wrote six documents and 8,802 bytes;
a status transition wrote twelve documents and 5,526 bytes. A payload-only change wrote just the source
job. This does not establish lower total monthly usage; compare actual queue traffic and dashboard use
before making that claim.

The additive `publication_job_listings_v1` backfill copies existing job metadata in batches of four.
The migration component reads source rows again while processing them, so a batch must leave room for
two reads of each near-limit payload. Its verifier checks each remaining job and both aggregate entries
before new dashboard traversals switch to metadata. The local dry run left no listing rows behind,
and the subsequent backfill and verification produced all thirty listings.

Neither migration changes source job payloads, status, attempts or publication settings. Production
execution requires confirmation under the production-write policy. To recover, restore the source-job
reader while retaining the listing table, triggers and aggregate. Keep decoding tagged cursors, or
reset dashboard pagination when switching sources, so open pages remain usable.

After production verification and live publishing measurements confirm the read budget, remove the
legacy reader and readiness fallback in a separate cleanup PR. Keep migration replay and snapshot
loading compatible with the derived listing.

Catalogue cleanup and verification select one entry to check all of a source's lists, avoiding the
same full source check per list. The check still covers stale and duplicate entries. A source with
ten list entries and 220 KiB of authored text stays below a 512 KiB read budget for each batch.

The [backend benchmark](./convex-catalogue-migration-benchmark.json) restored the same fixture before
each version. Combined migration reads fell from 5,988,238 to 762,834 bytes, with the same write
volume. Repeating the baseline reproduced its counters exactly. Compare the first scheduled refresh
through the daily usage reports before translating this fixture result into monthly savings.

Faction drafting reuses linked faction rows encountered by its catalogue scan. Its
[backend benchmark](./convex-faction-drafting-benchmark.json) compares identical ordered answers
from a synthetic 65-faction catalogue with 11 linked factions. Linked-query reads fell from
242,255 to 213,147 bytes (12.0%); unlinked reads stayed at 210,320 bytes and writes stayed at zero.
The repeated baseline reproduced both counters. This is a cold-query fixture result, not a monthly
savings estimate. `convex/playCatalogue.draftable.test.ts` caps reads at 384 KiB with 220 KiB of
linked faction text and covers missing/deleted links and the full 500-linked limit.

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
