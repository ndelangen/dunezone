# Next Convex savings and growth implications

Read-only follow-up, 12 October 2026. No code, plan, scheduled workflow or production data changed.
Uses the measured [usage report](convex-usage-research.md)
and its [aggregate logs](convex-usage-research/log-summary.json).
The figures are October observations, not measured results of these proposals.

## Immediate choices

1. Finish the published Rulebook HTML reader and measure the complete request, including illustrations. Its previous reader query represents 213.37 MB, 23.6% of monthly team I/O. Replacement metadata/access and dynamic images still cost reads. The editor remains separate. Implementation is in PR #2075; production savings remain unmeasured.
2. Give the editor loader and first subscription the same normalized reference arguments, then measure source-selection calls. This is a bounded way to avoid distinct full-book queries without a persistence migration. Ordinary text edits already avoid changing reference query arguments. [Editor report](rulebook-editor-performance-research.md).
3. Remove owner-profile enrichment only from the Assets landing query. Its UI renders type piles and images, not owner chips. [Backend](../../convex/assets.ts), `cataloguePage`, currently calls `toListEntry` with owner lookup memos; [landing UI](../../src/app/routes/_app/assets/index.tsx) does not display owners. Preserve owner details in category/detail queries. The complete function's 37.14 MB is an upper bound; most asset document reads remain, so the actual saving is smaller and unmeasured.
4. Stop homepage handling renewals for people only observing the table. Keep the public DO socket; request a ticket when the user intends to handle it, renew during handling, and stop after a defined idle interval. Initial mouse/touch/keyboard intent needs a clear wait/acknowledgement so it does not lose the first action. Preserve the 30-second server lease, expiry of held pieces, sign-out/revocation, and failure behavior. This needs a product-level interaction decision. [Subscription](../../src/app/routes/_app/homepage/HomepageSubscription.ts), [admission](../../convex/homepageAdmission.ts), [server](../../workers/game/homepage.ts).
5. Audit retired export data before deleting it. Live [issue #1576](https://github.com/ndelangen/dunezone/issues/1576) remains OPEN. It names the unmounted `homepageCommunity` component and six retired publisher tables. The [snapshot policy](../../scripts/lib/snapshot-policy.ts) drops these after the full production export. If the component retains significant rows, deletion would reduce storage and every later export. The tables may already be empty. Need current row/byte counts; no savings can be assigned yet. The issue explicitly reserves deletion until Norbert agrees.

There is no evidence that these small changes together keep the existing 2.4 GB monthly pace below 1 GB. Even removing the historical reader query, Assets landing query and all named homepage admission I/O would remove at most 31.4%, before replacement work. The existing projected pace would require about 58% reduction. Upgrade continuity and efficiency work remain separate decisions.

## Remaining published illustration reads

A fresh fetch of Dream Rulebook Edition 3 HTML found 292 image tags, including
five distinct annotated board illustration URLs. Those tags had no lazy-loading
attribute. The app reader implementation now adds native lazy loading while
composing the artifact, keeping dimensions and permanent artifact bytes intact.
This defers images below the viewport; reading the whole book can still request all five.

The [illustration resolver](../../convex/rulebookAnnotatedIllustration.ts) reads
Edition contents to find one Block's immutable annotation configuration.
The [delivery handler](../../workers/publisher/rulebook-illustration-delivery.ts)
resolves that data before replying `304` and serves `max-age=0, must-revalidate`.
An uncached five-illustration load can therefore add five full-Edition reads,
although cached identical queries can reduce actual database I/O. This can offset
reader-query savings on a cold full-book visit. The synthetic three-Page reader
measurement does not cover that real-book path.

The next read model should store one small annotation configuration per Edition
and Block, with the existing Ruleset/Rulebook availability gate and current source
availability checks. Backfill existing Editions and maintain new rows atomically
at publication. A separate option freezes image bytes in R2, but that changes the
current source-availability contract and needs an explicit publication decision.
Do not assign immutable caching to live-delivery URLs without that decision.

Measure the whole document and all image requests before declaring a realized
monthly saving. Lazy loading improves the initial request path; it does not remove
the full-book illustration cost.

## Homepage cost and headroom

The subscription renews every 20 seconds for each mounted signed-in visitor, even an observer. Existing viewport and document-visibility gates already stop offscreen/background connections. A steady observer-hour produces 180 issue calls, 180 redeem calls and 180 scheduled expiry calls. Rate-limiter component executions add to that.

The sample measured 3,072 root bytes of issue I/O and 2,567 root bytes of redemption I/O per cycle. That is 1,015,020 bytes per steady signed-in observer-hour, excluding component I/O, and at least 540 root calls/hour. Monthly named admission/limiter attribution was only 33.28 MB, 3.7%. It is currently smaller than Rulebook reads, but scales with signed-in time on the preview.

At 1,000 observer-hours/month that pattern alone would produce roughly 1.015 billion root I/O bytes and 540,000 root calls. At 10,000 hours it would produce 10.15 billion bytes and 5.4 million root calls. These are cadence extrapolations using one sample's bytes, not observed traffic forecasts.

The homepage's global issue and redemption token buckets each allow 300/minute, with capacity 50. With three renewals per minute per visitor, sustained demand around 100 signed-in connections approaches that issue budget, ignoring reconnects. The public table allows 128 connections but only 24 handling leases. Eagerly authenticating observers can consume the handling slots as well as budget. Intent-based authentication helps both cost and contention for the demo's permission slots. Constants and limiter definitions are in the sources above and [homepage protocol](../../src/shared/homepage/protocol.ts).

Canceling already-redeemed scheduled expiries is not an I/O priority. All 146 sampled homepage expiry calls read/wrote zero bytes after ticket deletion. It would target call counts and add cancellation bookkeeping. Similarly, slowing empty deletion-repair crons would delay recovery while attacking a resource that is currently below its cap.

## Exports and development rebuilds

Production snapshot export 47.05 MB plus development import 11.83 MB is 58.88 MB, 6.5% of team I/O. Development migration attribution adds 59.45 MB, making a 13.1% candidate group, but its exact causal fraction is unknown.

The [daily workflow](../../.github/workflows/anonymised-snapshot.yml) performs a full export regardless of whether published content changed. The [dev rebuild](../../.github/workflows/dev-rebuild.yml) exports again only for schema, migrations, snapshot policy/pipeline, forced runs, or unknown history. Code-only deployments already skip it.

If snapshot freshness can change, reducing daily cadence or sharing a verified export between jobs is bounded. Current artifacts retain only one day. Longer retention, source revision, schema/policy/anonymiser identity and freshness checks are necessary before reusing them. Same Git commit alone does not mean production content is unchanged. A publication-aware watermark could skip unchanged snapshots, but all kept entities, deletions, Edition artifacts and source changes must maintain it; that is more than a scheduling edit.

The [dev provisioning](../../scripts/provision.ts) drops migration/component progress and reruns every widen migration after import. The [replay test](../../convex/migrations.snapshotReplay.test.ts) confirms already-migrated content remains unchanged while aggregates rebuild. A dedicated current-snapshot initialization path could replace repeated historical scans with necessary aggregate/draft/index initialization, backed by schema/version provenance. Do not skip migration guards blindly. Imported rows bypass triggers, and the aggregates must be rebuilt. Measure individual migration bytes per rebuild first. This is a larger proposal than snapshot reuse.

## Hosted game usage

Hosted Play does not send moves or physics to Convex. The DO owns live room state/history; Convex owns admission, account status, directory/control data and source capture. Avoid projecting millions of pointer/move events as Convex function calls.

[AuthorizationWatch](../../workers/game/authorization.ts) batches admitted identities, holds a live revocation query, and validates at a 90-second cadence with a five-minute lease. [Account reconciliation](../../workers/game/index.ts) also batches retained accounts. A steady room produces about 40 cadence queries/hour for each current batch in each path, plus admissions, reconnects, source changes and reactive executions. It is not one renewal ticket per player every 20 seconds like the homepage.

The sample shows 34 authorization calls with 25 cache hits and 33 reconciliation calls with 24 cache hits. Therefore neither path can be billed as one full read per cadence call. Do not extend authorization leases or remove revocation watches on cost grounds without broader measurements and product approval. A future hosted-load test should record Convex bytes/calls per room-hour, batch occupancy, retained historical account count and reconnect rate, alongside Worker/DO cost. Retained-account scans may grow with lifetime participants even when the room has few current sockets.

## Year-ahead implications

See [year-ahead scenarios](convex-year-ahead-research.md) for separate visitor-growth,
fixed-call and cost assumptions. Full-book/full-catalogue reads can grow faster
than visitor counts. Ten times as many uncached executions with ten times the
relevant contents can approach 100 times that path's read bytes. Published HTML
and compact read models improve that scaling behavior.

The current recommendation is Convex Cloud Starter plus scoped improvements.
Prioritize public-read models and homepage handling intent before redesigning
editor storage. Measure cached executions and invalidations before claiming
savings. Self-hosting remains an ownership and operations choice until a prototype
establishes durable writes, capacity, recovery and the total infrastructure bill.
