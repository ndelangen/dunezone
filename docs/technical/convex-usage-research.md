# Convex usage and hosting research

Investigated on 12 October 2026. Source and deployed Worker revision were
`3bc00a482a7e7014cc0c2719ee8e8f5c575757fc`. This investigation reads usage, logs,
source and public pages. It changes no application code, plan or infrastructure.

The warning is real and concerns database I/O. The strongest current recommendation
is to keep Convex Cloud, use Starter if continued service requires exceeding the
free allowance, and measure a few scoped optimizations. The unchanged monthly pace
projects about $0.40 of Starter overage. That does not justify a backend migration
on cost grounds. Self-hosting on Cloudflare deserves a separate technical study,
especially if ownership matters independently of the bill.

## What the account actually uses

The authenticated [team usage dashboard](https://dashboard.convex.dev/t/norbert-de-langen/settings/usage)
showed these October totals at roughly 07:25 UTC. It listed one project, dune.zone,
and two deployments. These are account observations, not fixture measurements.

| Resource | Month to date | Free allowance | Interpretation |
| --- | ---: | ---: | --- |
| Database I/O | 902.53 MB | 1 GB | The resource approaching its cap |
| Function calls | 201K | 1M | About 20% used |
| Database storage | 18.72 MB | 512 MB | About 4% used |
| Action compute | 0.27 GB-hours | 20 GB-hours | About 1% used |
| File storage | 0 B | 1 GB | Published media already lives elsewhere |
| Data egress | 3.2 MB | 1 GB | Small |
| Search storage and queries | 0 | 512 MB and 3K query-GB | Unused |
| Deployments | 2 | 40 | Production and cloud development |

Reads account for 861.4 MB, or 95.4% of database I/O; writes account for 41.13 MB.
The dashboard's previous billing-period view, labelled 1 September to 1 October,
showed 303.34 MB read and 68.06 MB written. October has already exceeded that whole
period's I/O by more than twofold.

Independent read-only CLI counters returned:

| Deployment | Function calls | Database I/O in the API's GB unit |
| --- | ---: | ---: |
| Production, `exuberant-finch-263` | 183,298 | 0.786384294 |
| Development, `tame-raccoon-541` | 18,129 | 0.093999193 |
| Sum | 201,427 | 0.880383487 |

Converting 0.8804 GB at 1,024 MB per GB gives about 901.51 dashboard MB, suggesting
binary formatting rather than decimal formatting. The roughly 1 MB difference from the
dashboard observation is consistent with different collection times or aggregation
lag; the independent counters agree on the diagnosis. Do not divide the displayed
902.53 MB by 1,000 and treat the result as exact allowance usage. The native
counter indicates roughly 88% used. Development contributes about 10.7% of I/O.

The [production settings](https://dashboard.convex.dev/t/norbert-de-langen/dunezone/exuberant-finch-263/settings)
confirmed Europe, Ireland, deployment class S16 and Convex package 1.45.0.
Production has no configured per-deployment resource limits in the CLI readback.
Team plan enforcement is separate from those optional limits.

## What causes the reads

These are rounded monthly function-attribution figures from the dashboard, including
component attribution where named. They identify where to investigate; they do not
identify visitors or establish that every execution is useful product traffic.

| Function or operation | October I/O | Share of team I/O |
| --- | ---: | ---: |
| `rulebooks.readerPage`, production | 213.37 MB | 23.6% |
| `rulebooks.editorPage`, production | 123.16 MB | 13.6% |
| `factions.cataloguePage`, production | 76.61 MB | 8.5% |
| `lib.migrate`, development | 59.45 MB | 6.6% |
| Snapshot export, production | 47.05 MB | 5.2% |
| `profileActivity/profiles.list`, production | 45.81 MB | 5.1% |
| `rulesets.detailPageBySlug`, production | 40.17 MB | 4.5% |
| `assets.cataloguePage`, production | 37.14 MB | 4.1% |
| `rulebooks.save`, production | 25.65 MB | 2.8% |
| `homepage.get`, production | 21.72 MB | 2.4% |
| `homepageAdmission.redeemTicket`, production | 14.32 MB | 1.6% |
| `componentPublication.resolveDelivery`, production | 12.54 MB | 1.4% |
| Snapshot import, development | 11.83 MB | 1.3% |
| `rateLimiter/homepageAdmission.issueTicket`, production | 9.96 MB | 1.1% |
| `homepageAdmission.issueTicket`, production | 9 MB | 1.0% |

The two Rulebook page queries together account for 37.3%. This is the largest
measured group examined. Projecting fewer return fields alone would not eliminate
the underlying full-document reads.

### Homepage preview

The preview does generate repeated Convex work, but the known admission and limiter
attribution above is about 33.28 MB, or 3.7% of monthly I/O. Other small admission
operations may add to it. This evidence does not make it the main cause of the
database warning.

The [preview subscription](../../src/app/routes/_app/homepage/HomepageSubscription.ts)
renews a signed-in member's handling permission every 20 seconds. Each successful
cycle creates a ticket, redeems it, and schedules its expiry, even when the visitor
is only looking at the table. That is at least 540 root function calls per member
hour, plus any separately metered component calls. The
[admission functions](../../convex/homepageAdmission.ts) also read authentication
records and write ticket and limiter state. Signed-out observers have no ticket
callback. Table movement and pointer traffic go to the Cloudflare Durable Object.

The [current homepage](../../src/app/routes/_app/index.tsx) already gates mounting
by intersection and document visibility, with a 500px observer margin. Hiding the
page or leaving that region unmounts the connection. It does not run unconditionally
in every background tab. Renewing only after an intent to handle the table is a
candidate, but requires preserving the short permission lease and revocation rules.

The current marketing route does not subscribe to `homepage.get`. Its monthly
21.72 MB is historical usage from earlier code or other requests, so it cannot be
assigned to the current preview because of its name alone.

### Publisher and background work

The largest call counts are component delivery: roughly 38K HTTP resolver calls
and 38K internal resolution calls. The
[component delivery handler](../../workers/publisher/component-delivery.ts) resolves
source availability through Convex before reading R2 and before replying `304`.
It serves `Cache-Control: no-cache`. Browser revalidation therefore still reaches
Convex. This preserves deletion behavior and retained Leader images; adding an
immutable cache indiscriminately would change those contracts.

Deletion repair runs once per minute on production and development. Each deployment
shows roughly 16K calls, matching a calendar-driven workload rather than 16K deletion
requests. Its [indexed due-event read](../../convex/playDeletion.ts) can consume zero
document bytes when empty. In the recent sample below, 48 repair calls read zero
bytes. Reducing this cron would target function calls, which are not the current cap,
and would delay recovery. The publisher's five-minute work polling is another fixed
call floor, including separate HTTP and internal work calls.

### Production exports and development rebuilds

The user's prod-to-dev hypothesis is supported in part. The measured export, import
and development migration rows total 118.33 MB, or 13.1%. Export and import together
are 58.88 MB. Not all `lib.migrate` bytes can be attributed to rebuilds from function
names alone; that figure is a relevant candidate group, not a proven causal subtotal.

There are two distinct export paths:

- The [daily anonymised snapshot workflow](../../.github/workflows/anonymised-snapshot.yml)
  exports production, anonymises it and publishes a one-day artifact. Recent daily
  runs on 7 through 11 October completed successfully.
- The [development rebuild workflow](../../.github/workflows/dev-rebuild.yml) makes
  another fresh production export only when its data stage is selected. The
  [decision module](../../scripts/dev-rebuild-decision.ts) selects schema, migration,
  snapshot-policy and pipeline changes, forced rebuilds, or unknown base history.
  Other releases push code only.

The [12 October deployment run](https://github.com/ndelangen/dunezone/actions/runs/38198246858)
confirmed this distinction. Its development job pushed code; production export and
data rebuild steps were skipped. Rebuild is not synonymous with every deployment.

A bounded improvement could reuse an already-verified snapshot when its source
revision and policy match the required rebuild. Blindly using yesterday's snapshot
can omit newly published data or violate a changed policy. Reducing daily exports
would also change the freshness available to local development. These tradeoffs
are larger than the current monetary value of the reads.

## Recent runtime cross-check

A read-only production log sample contained 1,003 completion events between
06:40:17 and 07:28:44 UTC on 12 October. It is a recent, capped window, not a
monthly audit. Only aggregate function counters were retained in
[log-summary.json](convex-usage-research/log-summary.json); account identities,
arguments, return values and log messages were excluded.

The sample contained 145 issue calls, 145 redeem calls and 146 expiry calls, matching
the 20-second renewal pattern. Each issue read 2,161 bytes and wrote 911 bytes;
each redemption read 2,340 bytes and wrote 227 bytes. The issued and redeemed
ticket groups totaled about 818 KB of database I/O in that window.

One uncached editor query read 338,508 bytes from 11 documents. An uncached faction
catalogue query read 159,050 bytes from 54 documents. A second catalogue call was
cached and read zero bytes. This is direct evidence that query caching matters;
two requests do not automatically mean two full database scans.

The last-72-hour health insights showed 30 retry warnings on homepage ticket issue
and one on redemption, involving rate-limiter records. They showed no bytes-read or
document-read threshold findings. These small retry counts are not evidence for a
large contention refactor. Health thresholds also do not establish that monthly
usage is efficient.

## Optimizations worth measuring

No savings below have been measured. Preserve current results and access behavior,
then compare cold reads, cached reads, invalidation rate and monthly attribution.

| Candidate | Why it is credible | Scope and limits |
| --- | --- | --- |
| Use published Rulebook HTML for reader body | Avoid loading Edition contents and resolving the whole reference map on each reader execution | Largest reader opportunity; needs the publication and reader behavior decisions below |
| Reader first-page image lookup | Reader uses only the image URL, but the shared status helper also loads publication jobs with embedded source data | Small, behavior-preserving candidate; benefit depends on pending jobs |
| Assets landing preview projection | Landing reads owner profiles but displays no owner chips | Omit those reads only on landing; category and detail pages retain ownership |
| Compact faction previews | Catalogue reads full faction documents and broad relationship lists | Could serve catalogue and Ruleset previews; needs write maintenance and migration |
| Editor initial request reuse | Initial loader and live hook arguments differ, and reference changes can repeat the whole draft query | Check cache and invocation behavior before splitting subscriptions |
| Editor comparison digest | `hasUnpublishedChanges` reads current Edition contents alongside the saved draft | Larger schema/write change; retain a safe comparison fallback |
| Profile directory pagination/count summaries | Directory reads many profiles and four activity aggregate ranges per profile | Changes data shape or browsing behavior; existing aggregates already avoid raw activity scans |
| Admission on handling intent | Visible signed-in preview observers renew every 20 seconds | Preserve immediate handling, expiry, revocation and availability behavior |
| Snapshot reuse with provenance checks | Daily artifact and conditional dev rebuild can both export production | Must preserve anonymisation, policy compatibility and freshness |

Detailed source entry points are `convex/rulebooks.ts`, `convex/lib/rulebookReferences.ts`,
`convex/lib/rulebookPublication.ts`, `convex/lib/factionCatalogue.ts`, `convex/assets.ts`,
`convex/profiles.ts` and `convex/lib/profileActivity.ts`. Earlier improvements already
split Edition contents from metadata, batch faction links, bound asset landing
previews to five per type and memoize several joins. Those improvements exist today.

## Reusing published HTML

This is feasible. The existing [HTML delivery path](../../workers/publisher/rulebook-html-delivery.ts)
reads Rulebook and Ruleset availability plus a ready artifact identity, then streams
R2 bytes. It does not call `readerPage` or resolve the normal reference map.

Read-only production verification fetched
[Dream Rulebook Edition 3 HTML](https://dune.zone/published/rulebooks/pd71pdne3ggcn8gt002y7mvqnd8fnt85/editions/3/rulebook.html).
It returned `200`, 988,895 bytes, immutable one-year browser caching, no script tags
and `frame-ancestors 'none'`. Its ordinary friendly reader page also returned
successfully. This proves that the artifact is deployed and accessible, not that it
can replace the existing reader without changes.

A practical design is a slim metadata/access/history query plus published HTML for
the selected Edition's body. Keep drafts and editors on authorized live reads.
Resolve these product differences before implementation:

- The current reader selects the current Edition immediately; latest HTML selects
  the highest ready Edition. A preparing or failed new Edition needs explicit handling.
- The live reader resolves current faction and card data. Generated HTML freezes
  projected labels and geometry at generation time, while some images still use
  live delivery URLs. Choose the publication update contract explicitly.
- Sidebar tracking, page and selected-text links, Edition switching and management
  actions need to survive. Static HTML currently contains no reader scripts.
- The current CSP blocks iframe embedding. Serving or composing the artifact needs
  a deliberate rendering approach; an iframe alone is not an existing solution.
- Friendly reader URLs and artifact URLs have different canonical behavior.

Static HTML is not zero-Convex. Its annotated illustrations still use
[dynamic illustration delivery](../../workers/publisher/rulebook-illustration-delivery.ts),
which reads selected Edition contents and resolves source data, including before a
`304`. Capture/cache those images appropriately as part of the publication contract
if the goal is to remove repeated content reads. Ordinary component artwork has
availability checks too. Measure the complete document request path, including
images, before claiming a percentage reduction.

Even eliminating all historical reader-query I/O would remove at most its measured
23.6% attribution before replacement work is added. The editor's 13.6% does not
disappear by serving public HTML. Moving to HTML is therefore promising, but no
evidence yet shows it will keep the whole team under the free cap.

## What paying would cost

Starter has no fixed monthly fee and keeps the Free included resources, billing
overage. Professional costs $25 per developer per month. Standard Starter overage
is $2.20 per million calls and $0.22 per GB of database I/O. Ireland adds 30%, making
those $2.86 and $0.286. [Convex pricing](https://www.convex.dev/pricing),
[regions](https://docs.convex.dev/production/regions).

Using the native counters and roughly 11.3 elapsed days, a simple unchanged-rate
projection gives 2.4 GB of I/O and 0.55 million calls for October. Only I/O exceeds
the allowance in that scenario, giving about $0.40 before taxes and billing rounding.
This projection assumes the remainder resembles the observed period, including
development work. Daily usage is uneven; it is not an invoice or a growth forecast.
The small CLI/dashboard timing difference does not materially change that estimate.

| Total monthly database I/O | Starter I/O overage at Ireland rates |
| --- | ---: |
| 2.4 GB | $0.40 |
| 10 GB | $2.57 |
| 50 GB | $14.01 |
| 100 GB | $28.31 |

The table isolates I/O. Calls, actions, storage, egress and other resources can add
cost if their shared allowances are exceeded. Professional includes 50 GB I/O and
25 million calls. Choose it for combined spend, capacity or needed features,
rather than assuming the email requires a $25 subscription. Free and Starter both
remain S16; Starter payment does not increase concurrency.
[Resource and capacity limits](https://docs.convex.dev/production/state/limits).

At the same steady monthly pace, remaining on Free would require reducing total
I/O by about 58%. Most of this month's allowance has already been spent, so small
changes cannot guarantee avoiding the cap this October. Convex's FAQ warns that
continued excess Free usage can disable service; it does not promise a safe grace
period. [Pricing FAQ](https://www.convex.dev/pricing/faq).

Paid teams can set spending warnings and a hard team spending limit. A hard limit
disables projects when reached; it should not be confused with a harmless alert.
[Team settings](https://docs.convex.dev/dashboard/teams/teams). No limit or plan was
changed during this investigation.

## Hosting and migration choices

| Choice | Fit for this project | Cost and work judgment |
| --- | --- | --- |
| Convex Cloud Free plus optimizations | Preserves current contracts, but cap headroom is small | Useful efficiency work; insufficient evidence that Free is sustainable |
| Convex Cloud Starter plus scoped optimizations | Preserves auth, reactivity, transactions and operations | Best current balance; roughly $0.40 projected overage |
| Convex Cloud Professional | Higher capacity and paid operational features | No demonstrated need from this warning; assess features separately |
| Own Convex in Cloudflare Containers | Retains Convex application code, changes hosting responsibilities | Plausible, but durable database and recovery remain separate requirements |
| Replace Convex with Workers and D1/DO services | Uses the existing Cloudflare platform | Potential low marginal infrastructure cost, largest application rewrite |

Normal Workers cannot run the shipped native Convex backend. Containers can run
native images, but their filesystem is ephemeral. The default SQLite/local-file
configuration cannot serve as a durable production database there. Filesystem
snapshots preserve a point in time, not every subsequently acknowledged write.
[Convex backend binary](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/running_binary_directly.md),
[Workers compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/),
[Containers FAQ](https://developers.cloudflare.com/containers/faq/).

The defensible starting design is a singleton Convex container, external durable
Postgres or MySQL, R2 object storage, Worker routing and explicit backup/restart
procedures. Convex documents those SQL backends and R2, but no D1 or Durable Object
database adapter. This is a proposed composition, not a tested supported recipe.
[SQL configuration](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/postgres_or_mysql.md),
[R2 configuration](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/s3_storage.md).

For 720 continuously running hours, a basic 1 GiB/4 GB container costs about $6.93
for memory and disk after unused included allowances. A standard-1 4 GiB/8 GB
instance costs about $27.10. These omit CPU, the durable database, R2, routing,
dashboard hosting and operations. They assume the Workers Paid plan is already
paid and its Container allowances are unused. Neither size is proven adequate for
this workload. [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/),
[sizes](https://developers.cloudflare.com/containers/platform/limits/).

The detailed parallel investigation covers routing, persistent credentials,
authentication, components, scheduled work, upgrades and failure tests in
[Cloudflare self-hosting research](convex-cloudflare-self-hosting.md).

Replacing Convex entirely is a different project. Cloudflare already owns Play
game state in SQLite Durable Objects and published bytes in R2. Convex still owns
catalogue authoring, relationships, collaborative access, drafts and Editions,
OAuth and session handling, tickets and revocation, publication coordination,
retry work, migrations, aggregates, rate limiting and live query invalidation.
Those contracts would need replacements, along with local provisioning, E2E and
Storybook execution. Copying tables is a fraction of the work.

D1 Paid includes 25 billion monthly rows read, 50 million rows written and 5 GB
storage, with no D1 egress charge. Marginal database cost could be zero within
remaining account allowances, but we have not inspected those allowances or
benchmarked a replacement. Workers and real-time delivery have their own costs.
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
Durable Objects provide WebSocket delivery and durable state; that does not by
itself replace Convex query dependency tracking and authorization.
[WebSocket support](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## Recommended next work

Keep the hosting decision separate from the impending free cap. Starter is the
proportionate continuity option if paying a small overage is acceptable. Do not
buy Professional solely because of this email, and do not migrate production as
an emergency response to less than a dollar of projected usage.

First measure the two small, behavior-preserving read changes: reader image lookup
and assets landing owner reads. Then prototype the published-HTML reader with the
current features and publication behavior made explicit. Measure full document
and image I/O, cold and cached requests, editor invalidations, and subsequent
daily account usage. Evaluate admission renewal and snapshot provenance separately.

Continue the self-hosting study to establish feasibility and failure behavior.
A successful container boot is not a production readiness result. Any prototype
must use synthetic data and prove acknowledged writes survive abrupt restarts,
auth and live subscriptions recover, scheduled work remains correct, and backup
restore works. Infrastructure spend and a production cutover require a separate
decision after that evidence exists.

The investigation establishes real billed-resource counters and concrete source
opportunities. It does not establish human visitor attribution, monthly cache-hit
ratios, realized optimization savings, self-hosted capacity or a migration schedule.

## Follow-up after approval

The user approved making published HTML the default reader. Implementation and
verification are tracked in [PR #2075](https://github.com/ndelangen/dunezone/pull/2075).
The [editor audit](rulebook-editor-performance-research.md) records Page-oriented
opportunities without changing the editor. The continued research covers
[next savings](convex-next-savings-research.md) and
[year-ahead costs and growth assumptions](convex-year-ahead-research.md).
No plan or hosting change has been made.
