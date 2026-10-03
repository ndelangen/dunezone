# Hosted public delivery rehearsal

Measured on 3 October 2026 for [Verify hosted previews, live data and operating costs](https://github.com/ndelangen/dunezone/issues/1721).

Serving public HTML to humans as well as crawlers remains the simpler choice. At 10,000 human initial loads, the measured scenario adds about **$0.096 per month** for human SSR at exhausted-allowance rates, even with no cache hits. Including the independently assumed bot and image traffic gives about **$0.121**, including one log event per request. These are proportional usage estimates, not an account bill. Plan minimums, shared allowances, billing rounding and existing browser subscriptions are separate below.

The hosted checks found no delivery regression requiring another implementation. Cached HTML becomes live data in the browser, a backend outage leaves cached content readable, expired sessions return to the public view, deleted records replace the stale view, and an older client can navigate after deployment. An external metadata scraper decoded the production Test Faction and Water previews. Native social-platform presentation remains unverified.

## Evidence and reproduction

- [Sanitized raw evidence and measurement scripts](https://github.com/ndelangen/dunezone/releases/download/public-delivery-1721/public-delivery-1721-evidence.zip)
- [Calculated cost inputs and scenarios](public-delivery-rehearsal/cost-model.json)
- [Test Faction preview](https://github.com/ndelangen/dunezone/releases/download/public-delivery-1721/public-delivery-1721-test-faction.png)
- [Water preview](https://github.com/ndelangen/dunezone/releases/download/public-delivery-1721/public-delivery-1721-water.png)

The archive contains request headers, response bodies, SHA-256 digests, provider CPU records, database read counters, scraper responses, browser observations, deployment logs and cleanup results. `python3 cost-model.py` reproduces the monetary estimates from the included JSON. `measure.py` describes the bounded sequential workload. Its temporary origin has been deleted; rerunning the hosted workload requires a fresh isolated deployment. `summarize.py` reads the included Tail export.

Source revision was `7772d905cfe697b64b22745ae9c1d5e140746d24`. The production publisher source was rebuilt with a disposable backend URL and test login enabled. A temporary wrapper restricted methods and publisher routes and added `noindex`. There were no production data writes. This was not a byte-identical production artifact.

| Artifact | Identity |
| --- | --- |
| Initial hosted Worker | `39977aee-2828-41ac-b95c-3db14214edd9` |
| Release-transition Worker | `88298e1d-709c-441e-99b7-05fb76a055ce` |
| Temporary Tail Worker | `fc4276e9-3a98-4e49-845c-b495169e5a78` |
| Renderer digest | `89813e6614d12fa499eb1e5bc622b373b696e705b4d5aac1bfbba7b76019d806` |

The backend was a disposable local Convex instance, seeded with synthetic fixtures, reached through a restricted API proxy and Cloudflare Quick Tunnel. Only the temporary R2 bucket was bound. Production publication, browser capture, Play and scheduled jobs were excluded from the rehearsal configuration.

## Hosted measurements

There were 122 scripted requests, below the 200-request cap, with one active scripted request at a time. The first 105 covered two setup reads, 60 HTML requests, 40 PNG requests and three missing URLs. The remaining 17 covered live-data, outage, deletion and release checks, including five retained static files. Provider CPU matched all 117 Worker requests; the five static files bypassed the Worker. Interactive browser activity, deployment activation probes and read-only production scraper checks were separate from that scripted sample.

Each measured HTML family had six unique cache misses followed by six immediate repeats. Each image family had ten misses and ten repeats. All repeats hit the cache and returned identical bodies with zero new metadata queries or renders. The paired workload therefore had a 50% hit ratio by construction. It does not forecast real traffic or cache survival across Cloudflare locations.

| Response | Miss CPU median / maximum, ms | Hit CPU median, ms | Miss / hit elapsed median, ms | Body bytes |
| --- | ---: | ---: | ---: | ---: |
| Faction detail | 355.5 / 751 | 1 | 1207.1 / 241.9 | 97,624 |
| Asset detail | 294.5 / 329 | 1 | 942.2 / 144.8 | 51,204 |
| Faction catalogue | 53.5 / 564 | 1 | 304.0 / 175.9 | 75,175 |
| Asset catalogue | 49.5 / 81 | 1 | 287.0 / 133.6 | 69,660 |
| Asset type listing | 37.5 / 355 | 0 | 253.7 / 134.9 | 46,426 |
| PNG without artwork | 485.5 / 860 | 2 | 635.4 / 141.9 | 32,444 |
| PNG with artwork | 916 / 1172 | 1 | 1370.3 / 261.6 | 407,500 |

A provider CPU value of zero reflects integer measurement resolution. Network waiting is excluded from CPU. HTML elapsed time includes the tunnel and local database, so it is not a production Ireland latency measurement. These are cache misses, not proven cold isolates. The first observed catalogue request used 647 ms CPU and took 2379.5 ms end to end. Deployment activation initially returned errors before the Worker became reachable; those probes are excluded from the performance sample.

The artwork input was a synthetic 1400 × 1400 JPEG of 1,527,846 bytes. Each artwork miss used a distinct revision, forcing an R2 read. Both generated PNG variants and both production previews fully decoded to 1200 × 630 RGBA pixels. This proves the tested inputs work; it is not a concurrency or maximum-image capacity test.

Wrangler reported 200 ms startup and 26,074.35 KiB uncompressed upload, with 5,814.72 KiB gzip, for the initial deployment. The second deployment reported 189 ms startup. The configured CPU ceiling was 30,000 ms. Current platform limits are 128 MB per isolate, 64 MiB uncompressed Worker size and one second startup. The measured renders need the paid CPU allowance. Peak memory was not measured by the Tail API, and passing this sequential run does not establish memory headroom under concurrency. [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)

## Database work

A temporary internal probe called the same five anonymous page queries against the seeded local backend and collected `ctx.meta.getTransactionMetrics()`. It ran after the CPU sample, against one additional synthetic owned faction. These are actual local backend read counters, not production billing telemetry and not JSON sizes substituted for reads. The probe was removed before cleanup.

| Anonymous query | Documents read | Database bytes read | Returned JSON bytes |
| --- | ---: | ---: | ---: |
| Faction detail | 3 | 5,633 | 3,526 |
| Asset detail | 4 | 1,331 | 1,936 |
| Faction catalogue | 10 | 12,925 | 6,752 |
| Asset catalogue | 17 | 10,903 | 13,044 |
| Asset type listing | 4 | 2,188 | 2,608 |

The raw counters include the probe's nested invocation bookkeeping. They are not a count of externally billed function calls. The delivery diagnostics showed one metadata function request per HTML miss and none per hit. Image requests made no Convex calls. The cost model uses the mean read bytes above, 6,596, for an explicitly uniform page mix. Returned JSON averages 5,573.2 bytes and is only an estimate for egress; protocol overhead and production catalogue size can change it. Convex bills database I/O separately from result transfer. [Convex limits and usage definitions](https://docs.convex.dev/production/state/limits)

## Browser and failure behavior

| Check | Observed result |
| --- | --- |
| Signed-in owner | Anonymous HTML initially showed Login without Edit faction. Hydration restored the synthetic owner's edit action. |
| Stale HTML to live data | Updating spice from 10 to 11 left the cached HTML byte-identical at 10. The browser subscription displayed 11, including after loading the cached URL. |
| Slow initial connection | With 1500 ms emulated latency and 128 KiB/s throughput, the initial public content remained readable without owner actions. Normal networking was restored. |
| Backend unavailable | Stopping the API proxy also closed its WebSockets. Cached HTML remained HTTP 200; the browser retained public content without owner actions. An uncached URL returned HTTP 500. |
| Backend recovery | After restarting the proxy, that same failed URL returned HTTP 200 on a cache miss. The failure had not been cached. |
| Expired session | A local-only probe expired both sessions and refresh tokens for the synthetic account. After reload, the browser settled into the public view with Login. |
| Deleted record | The old cached HTML remained HTTP 200. A fresh cache key returned HTTP 404. The browser replaced the old page with Faction not found. Expected NOT_FOUND errors appeared in the console. |
| Older HTML after release | The second build disabled the test login UI, changing client hashes. Production retention code preserved 68 older files. Five hosted files matched their previous digests. Replaying the exact old HTML loaded the old entry and navigated to the populated asset catalogue without new errors. |

The initial CDP offline and URL-blocking attempts did not reliably stop WebSocket hydration. They are excluded as outage proof; stopping the proxy supplied that evidence. Both browser network controls were reset. The release test replayed archived HTML deliberately. It did not assert that a release-scoped cache key should keep serving the previous release's HTML.

Microlink fetched the public production pages for [Test Faction](https://dune.zone/factions/test-faction) and [Water](https://dune.zone/assets/token-disc/water). It found absolute image URLs and PNG metadata of 193,649 and 124,356 bytes respectively. Separate full PNG decoding passed. This is external scraper evidence, not a screenshot of a Facebook, X, Discord or LinkedIn card. Their native presentation and platform-specific caches were not exercised. [Microlink API](https://microlink.io/docs/api/getting-started/overview)

## Monthly cost model

Prices were checked on 3 October 2026. Amounts are USD before taxes.

Workers Paid has a $5 account minimum with 10 million requests and 30 million CPU milliseconds included. Overage is $0.30 per million requests and $0.02 per million CPU milliseconds. Static asset delivery and egress have no separate charge here; Cache API hits still invoke this Worker. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

The Convex pricing page's Europe West Ireland selector showed Starter overages of $2.86 per million function calls, $0.286 per GB of database I/O and $0.1716 per GB of egress. Starter includes 1 million calls, 1 GB I/O and 1 GB egress. Pro starts at $25 per developer per month, with 25 million calls, 50 GB I/O and 50 GB egress; its corresponding Ireland overages are $2.60, $0.26 and $0.156. The model uses Starter's higher rates. Account tier and remaining allowances were not inspected. [Convex pricing](https://www.convex.dev/pricing)

R2 Standard includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations. Additional storage is $0.015 per GB-month, writes $4.50 per million and reads $0.36 per million, with free egress. R2 rounds billable usage up to whole billing units. The proportional R2 values below are usage attribution: a small addition crossing an exhausted read allowance can add a $0.36 billing unit rather than a fraction of a cent. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Current Workers Logs pricing includes 20 million events per month, then $0.60 per million, with seven-day retention. The table assumes one invocation event per request; extra application logs add to that. Pricing changes on 1 December 2026 and needs revisiting then. Temporary Tail collection is measurement overhead, excluded from ongoing delivery costs. [Workers Logs pricing](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

Scenario assumptions:

- 1,000 human initial loads, independently 250 bot HTML loads and 100 image loads.
- 10,000 human initial loads, independently 1,000 bot HTML loads and 500 image loads.
- A uniform mix of the five HTML families. Every image miss reads artwork; this is conservative relative to fallback images and reusable artwork cache hits.
- Either zero cache hits or the paired run's 50% hit ratio, applied separately to human HTML, bot HTML and images. Real Cache API entries are local to each Cloudflare location and may be evicted.
- Mean CPU, rather than medians, for billing: 178.1 ms per HTML miss, 1.067 ms per HTML hit, 834.9 ms per artwork PNG miss and 1.6 ms per PNG hit. Decimal GB is used for the byte estimates.

| Human loads | Bot / image loads | Hit ratio | Human SSR increment | Bot HTML | Images and artwork reads | Logs estimate | Combined usage value |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 250 / 100 | 0% | $0.00956 | $0.00239 | $0.00174 | $0.00081 | $0.01450 |
| 1,000 | 250 / 100 | 50% | $0.00494 | $0.00124 | $0.00088 | $0.00081 | $0.00787 |
| 10,000 | 1,000 / 500 | 0% | $0.09565 | $0.00956 | $0.00868 | $0.00690 | $0.12079 |
| 10,000 | 1,000 / 500 | 50% | $0.04943 | $0.00494 | $0.00442 | $0.00690 | $0.06570 |

The human increment compares public SSR with the existing static client shell and excludes the unchanged client subscriptions. If shared included usage remains sufficient, these extra metered charges are zero. Otherwise the table values usage at the overage rates, before billing-unit rounding. Do not add a new $5 plan fee for each Worker or each feature; it is an account minimum. Existing account consumption and any Convex developer seats still determine the actual bill.

For each traffic class, misses equal requests × one minus hit ratio. Worker CPU equals misses × mean miss CPU plus hits × mean hit CPU. HTML misses add one Convex call plus the measured database read bytes and estimated egress bytes. Images add no database call, and this scenario adds one R2 read per image miss. The JSON and executable model preserve every component before rounding.

A visitor's live subscriptions are separate. Existing shell and page queries still subscribe after hydration and can re-execute on updates. As a scale example, 10,000 additional subscribed query executions would cost $0.0286 in function usage at the Starter Ireland rate, plus their actual database I/O and egress. One page load is not necessarily one subscription execution. The table does not claim to price the whole existing application, publication pipeline or stored artwork.

No prepared R2 snapshots or stored social PNGs are required. Cache API contents do not add R2 storage or writes. Existing artwork storage and publication costs remain. At the linear rate, another 1 GB-month of artwork is $0.015 after allowance, subject to rounding. Retained browser chunks use Workers Static Assets and have file-count and per-file limits. The rehearsal did not introduce permanent storage or logging services.

## Limits and remaining work

The social renderer admits at most two active renders per isolate and requests a limit of 20 uncached renders per ten seconds for the shared social-render key in each Cloudflare location. Cache hits bypass that render limiter. This is a regional guard, not an account-wide spending cap. [Cloudflare rate-limiting semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

At a continuously saturated nominal two renders per second for 30 days, one location could attempt about 5.184 million renders. At the observed artwork mean, that is about $86.57 of CPU plus $1.56 of requests, before allowances, artwork reads and logs. This extrapolation is neither a measured throughput result nor a hard maximum. Multiple locations multiply it, the limiter is approximate, rejected requests still have cost, and the configured 30-second CPU ceiling is much higher than the measured mean. The sequential run did not test limiter saturation or concurrent memory pressure.

No implementation days are justified by the measured small-traffic costs. Remaining planned work is [Release searchable pages and social previews and verify production](https://github.com/ndelangen/dunezone/issues/1722): reconcile the final changes and reviews, inspect the protected deployment and application/Renderer identities, confirm publisher and Play responsibilities, and repeat read-only production acceptance. Allow roughly half a working day for that verification if deployment stays green. This is an engineering estimate, not a measured duration. Native social-platform presentation, peak memory and sustained abuse capacity remain explicitly unverified; none is evidence for adding a queue or snapshot service now.

## Cleanup

The temporary publisher and Tail Workers were deleted, the synthetic R2 object and bucket were deleted, and the local proxy, tunnel and Tail collector were stopped. The disposable Convex Docker project was removed, with no remaining containers or volumes for that project. The temporary backend probe and authentication-token file were removed. Cleanup logs are in the evidence archive. No diagnostic route or rehearsal binding is included in the application changes.
