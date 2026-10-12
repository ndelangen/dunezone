# Convex usage a year from now

Investigated on 12 October 2026. This extends the [account audit](convex-usage-research.md)
and [next savings research](convex-next-savings-research.md). It changes no billing
or infrastructure. The static reader implementation is in [PR #2075](https://github.com/ndelangen/dunezone/pull/2075).
Its production savings are not yet measured.

I would stay on Convex Cloud, choose Starter for continuity, and make the public
read paths cheaper. At ten times today's demand, current calls and database I/O
would cost roughly $16 to $19 per month. At thirty times, Professional becomes a
useful comparison. Self-hosting should earn its place through measured capacity,
recovery and total operating cost.

## What we can extrapolate

Today's projected monthly pace is about 2.4 GB database I/O and 550,000 function
calls across production and cloud development. It comes from roughly eleven days
of this month, including deployment work, editing, snapshots and ordinary reads.
We do not have a year of usage, reliable visitor counts or per-session workload
measurements. October's increase over September cannot establish a durable growth
rate.

Use month-12 demand scenarios of 1x, 3x, 10x, 30x and 100x. These describe possible
workloads, not audience forecasts. Even 1x describes the current workload mix, which
may change substantially after Play launches. Game moves already live in Cloudflare
Durable Objects; one move is not one Convex call.

The source implies a calendar-driven floor of at least 142,848 calls per 31-day
month. Two deployments each run [deletion repair](../../convex/crons.ts) every minute,
accounting for 89,280 executions. The [publisher](../../workers/publisher/index.ts)
polls three work queues every five minutes, each using an HTTP action and an
internal mutation, adding 53,568. The [schedule](../../workers/publisher/wrangler.jsonc)
is already in the baseline. Actual work, retries and nested component calls can
add more.

For visitor growth with unchanged deployments and polling, calls in millions are
`0.142848 + 0.407152 * growth`. A second model scales all 550,000 calls with demand.
The range exposes the importance of that assumption. Database I/O scales with
demand in both models because we lack a measured split of fixed and visitor-driven
bytes. This likely overstates export and development growth when only visitors grow.

## Month-12 cost scenarios

Ireland Starter overage costs $0.286 per GB beyond 1 GB and $2.86 per million calls
beyond 1 million. Professional costs $25 per billed developer, including 50 GB I/O
and 25 million calls. Ireland Pro overage is $0.26 per GB and $2.60 per million calls.
These use current [pricing](https://www.convex.dev/pricing) and Ireland's
[30% resource surcharge](https://docs.convex.dev/production/regions).
Included amounts belong to the team, rather than each deployment.

The table includes calls and I/O only. The first price keeps the background call
floor fixed; the second scales every call. Pro assumes one billed developer and
the fixed-floor model. Add $25 for each further developer.

| Month-12 demand | Monthly I/O | Monthly calls | Starter per month | Pro, one developer |
| --- | ---: | ---: | ---: | ---: |
| 1x | 2.4 GB | 0.55M | $0.40 | $25.00 |
| 3x | 7.2 GB | 1.36M to 1.65M | $2.82 to $3.63 | $25.00 |
| 10x | 24 GB | 4.21M to 5.50M | $15.77 to $19.45 | $25.00 |
| 30x | 72 GB | 12.36M to 16.50M | $52.79 to $64.64 | $30.72 |
| 100x | 240 GB | 40.86M to 55M | $182.35 to $222.79 | $115.63 |

Storage, actions, egress, search and new products may add cost. Current database
storage is only 18.72 MB. That is retained data, not monthly ingestion; multiplying
it by twelve would be a false annual forecast. The 41.13 MB of writes includes
updates and deletions, so it is not net new storage either. Index growth, Editions,
published data and retention need separate measurements.

Action compute projects roughly 0.74 GB-hours per month. Even a 10x sensitivity
stays below Starter's 20 GB-hours. At 100x, a constant-mix action scenario would
add roughly $23 per month on Starter. Pro includes 250 GB-hours. This is an extra
sensitivity, not an asserted relationship between visitors and action compute.
Existing Cloudflare costs, taxes and future price changes are outside the table.

The arithmetic Starter/Pro crossover in the fixed-floor calls/I/O model is around
15x for one developer and 32x for two. Seats and required features matter. Paying
for Starter preserves the S16 deployment class. Pro raises concurrent query and
mutation capacity from 16 to 256 and concurrent sessions from 1,000 to 10,000.
Monthly call totals cannot predict peak concurrency, contention or queueing.
[Current capacity limits](https://docs.convex.dev/production/state/limits).

## Annual totals depend on when growth happens

Flat usage for twelve months produces about $4.80 of Starter calls/I/O overage.
One-developer Pro's fixed fee alone is $300 annually. A month-12 bill multiplied by
twelve is the annualized exit rate, not the preceding year's total bill.

For an explicit smooth-growth example, start at today's demand in month one and
reach the multiplier in month twelve with equal compound monthly growth. Hold the
background call floor fixed and today's allowances/prices constant. Sum each
month's overage separately.

| Demand reached in month twelve | First-year Starter calls/I/O total | Annualized exit rate |
| --- | ---: | ---: |
| 1x | $4.80 | $4.80 |
| 3x | $14.00 | $33.87 |
| 10x | $60.45 | $189.22 |
| 30x | $173.25 | $633.49 |
| 100x | $506.64 | $2,188.23 |

The unrounded inputs, formulas and results are saved in
[year-scenarios.json](convex-usage-research/year-scenarios.json).
These are calculations under a chosen path. A launch spike, a late launch or more
editing can produce different totals. They do not justify selecting an annual
plan from a single month's warning.

## What the HTML change does to the model

The old reader query accounts for 23.6% of measured team I/O. Eliminating that
entire attribution would reduce the present 2.4 GB pace to 1.83 GB. It would still
exceed Free's 1 GB allowance. At 10x, that same best bound would lower Starter's
fixed-floor calls/I/O cost from $15.77 to $14.15. At 100x, from $182.35 to $166.15.
Replacement metadata, availability checks and dynamic illustrations remain, so
these are upper bounds on the savings from this one attribution.

The more valuable long-term property is scaling. A full-book read scales with both
uncached executions and book size. Ten times as many executions reading ten times
the content can approach 100 times the bytes for that path. Slim metadata plus
published artifacts avoids carrying the whole book through normal reader queries.
The editor still loads the draft and compares it against the current Edition.

The next image-delivery investigation matters for the same reason. The current
Dream artifact contains five annotated images, each capable of an uncached
full-Edition read. Published HTML
still requests annotated illustrations through a path that reads Edition contents
and reference data. Measure complete document loading and browser revalidation
before treating static HTML as a solved public-read cost.

## The homepage changes the growth mix

The preview renews signed-in observers' handling permission every twenty seconds.
The captured root calls produce about 1,015,020 I/O bytes and at least 540 calls per
observer-hour, excluding limiter component usage. At 1,000 signed-in observer-hours
per month, that alone is roughly one billion bytes and 540,000 calls. At 10,000
hours, ten billion bytes and 5.4 million calls. These are cadence extrapolations,
not visitor forecasts. Only hours while mounted and visible count under current
viewport and background-tab gates.

Authentication on handling intent would make this cost follow interaction rather
than observation. It also avoids filling the table's 24 handling leases with
observers. This deserves attention before substantial homepage growth, even though
current measured admission/limiter I/O is only 3.7% of the month's total. Preserve
first-action delivery, keyboard/touch access and the short revocation lease.
[Sources and constraints](convex-next-savings-research.md#homepage-cost-and-headroom).

## What this means for the hosting proposal

Keep Starter plus scoped optimizations as the near-term recommendation. At 3x,
both cost models remain below $4 per month for calls/I/O. At 10x, measure full-book
reads, image delivery and admission churn, and compare Pro if features or peaks
need it. At 30x or 100x, compare the actual combined bill and measured capacity
against Pro and a tested self-host deployment.

Cloudflare Containers start around $6.93 per month for a continuously running basic
instance's memory/disk under unused allowances, or about $27.10 for standard-1.
CPU, durable SQL, backups, R2, routing and operations add cost. The basic size is
not proven adequate. Containers have ephemeral filesystems; the proposed Convex
architecture requires external durable Postgres or MySQL. These are cost floors,
not quotes for a working replacement.
[Container pricing](https://developers.cloudflare.com/containers/platform/pricing/),
[hosting design and failure tests](convex-cloudflare-self-hosting.md).

Self-hosting may make sense for ownership or operational requirements. Today's
usage and a guessed growth multiplier do not establish that it saves money or
engineering time. A migration also replaces auth, authorization, transactions,
live query invalidation, publication coordination and operational tooling.

LiveStore has a supported Cloudflare sync backend and a server-side Durable Object
adapter. Its strongest candidate here is persistent local Rulebook authoring.
Small edit events could reduce repeated draft transfers, while retained history
and fresh-client replay create new growth costs. A whole-store sync does not become
Page-only because the editor queries one Page. The
[LiveStore assessment](livestore-convex-research.md) gives an editor experiment,
permissions and publication requirements, and a year of illustrative event growth.
It supplies no measured replacement bill. At the 10x Convex scenario, cost alone
still does not justify a full migration.

## Measurements that make the next decision defensible

Record daily team totals and per-function attribution around the reader release,
with deployment/export/editor activity marked. Capture cold and cached full-document
requests including images. For the editor, measure draft size, invalidations and
whole-book reads per session. For the homepage, measure signed-in visible observer
hours and handling time. For Play, measure Convex bytes/calls per room-hour and
retained account batch size alongside Cloudflare cost.

Compare a week after deployment with the preceding workload and repeat after a
month. Use the resulting workload mix to replace the uniform multipliers. Revisit
hosting when spend, capacity, needed features or ownership justify it. No account
plan, scheduled workflow or data retention policy changed during this research.
