# Public response caching

The publisher uses Cloudflare's Cache API for anonymous HTML, social PNGs and their existing JPEG
artwork. It adds no storage product, background job or save-time generation. A miss independently
reconstructs the response. An unavailable cache still returns the generated response.

## Lifetime and identity

`PUBLIC_CACHE_SECONDS` in `workers/publisher/public-cache.ts` owns the deployment settings.

| Response | Maximum edge lifetime | Work on a hit |
| --- | ---: | --- |
| Public HTML | 5 minutes | No metadata query or server render |
| Social PNG | 1 day | No render, metadata query or artwork read |
| Recognized fallback PNG | 5 minutes | No render, metadata query or artwork read |
| Existing JPEG artwork | 1 hour | No R2 read |

Cloudflare may evict entries early. The cache is local to a Cloudflare location and has no tiered
replication. GET and HEAD share an entry. Browsers receive `Cache-Control: no-store`; the longer
lifetimes exist only on the responses stored through the Cache API. Human visitors always start
the existing live subscriptions after hydration.

Keys include the deployed Worker version, response kind, origin and a SHA-256 digest of normalized
public inputs. A release changes the social renderer and HTML together, so the Worker version also
identifies the renderer. PNG keys use the parsed social contract's fixed-order serialization;
HTML query parameters are sorted without dropping values or changing duplicate order. Different
filters remain different pages. Artwork keys include its supported publication path and revision
hint. No cookies, authorization headers or forwarded headers reach anonymous HTML generation.
Only public routes dispatch into this cache. Response Set-Cookie, private/no-store/no-cache directives,
Vary and non-200 statuses prevent storage before delivery strips cookies.

A deletion, access change or rename becomes visible to a fresh HTML lookup after its entry expires,
at most five minutes without early eviction. The browser's live result can replace it sooner.
Missing subjects return 404 and are not cached. Cached HTML never grants permissions. Old social
URLs may combine old words with current artwork. A PNG already cached can remain for a day; a newly
rendered PNG can use artwork cached for an hour, so stale artwork can survive for almost 25 hours
in the worst timing. Revision hints normally avoid this overlap but do not promise historical art.
Missing or rejected artwork and caught render failures use the five-minute fallback lifetime.
A caught artwork-render error also evicts that artwork entry so the next attempt can read repaired bytes.
A JPEG that passes the bounds but silently decodes to nothing can reveal the monogram underlay and
remain cached for a day. Detecting every malformed JPEG would require more decoding work; this
retains the agreed best-effort behavior. Social platforms also own caches outside our control.
[A published asset outlives the deletion of the thing it depicts](https://github.com/ndelangen/dunezone/issues/1037)
still owns publication takedown. This cache does not revoke already public artwork.

## Miss limits

PNG input remains bounded to 4,096 URL characters, bounded text and a two-megabyte JPEG with no more
than two million pixels. At most two misses may load artwork or render at once in an isolate.
Excess work receives a retryable 503 without queuing. A Cloudflare rate-limit binding allows 20
PNG misses per 10 seconds per location across callers; hits bypass it. Rejected misses return 429
with `Retry-After: 10`, without reading artwork or rendering. Binding failure returns an uncached
503. Render exceptions retry once without artwork. The publisher's existing platform CPU ceiling
remains 30,000 ms per invocation because the same Worker also runs publication jobs.

The rate limiter is approximate and local to each Cloudflare location. The two-slot counter is
isolate-local. Concurrent misses for the same key can render twice, and different isolates or
locations have independent work. There is no distributed lock or global spend cap. A stricter
social-only CPU ceiling would require separating its execution from the publisher; a JavaScript
timeout cannot interrupt synchronous WASM and is not a CPU limit.

## Diagnostics and checks

Responses expose `X-Public-Cache` as hit, miss, bypass or error. `X-Public-Renders`,
`X-Public-Metadata-Queries` and `X-Public-Artwork-Reads` count work for that request. The server data
doorway increments the metadata counter around actual query attempts; it does not infer it from
page type. PNG responses also distinguish artwork-cache state and recognized fallback use.
The custom failure log contains only an event name, never exception text that could include card
words. Existing platform invocation logs retain their existing configuration.

`public-cache.test.ts` checks expiry, eviction, release changes, credential equality, rejected
responses, cache failures and burst limits through the cache seam. `social-image.runtime.test.ts`
checks actual workerd Cache API hits, byte equality, shared artwork and zero outbound HTTP calls.
`publisher:application-runtime:verify` runs the assembled release and checks five public page shapes:
one metadata query on a miss, none on the following hit, identical public bodies, live-client script
availability and unchanged browser-only dispatch. It also follows detail HTML into PNG misses and hits.


### Local measurements

A local workerd run on macOS arm64, Node 22.16.0, used maximum-length name, kind and excerpt fields.
Each case made ten sequential misses, including the first render, followed by five hits. The artwork
case used a seeded-noise 1,400 by 1,400 JPEG of 1,401,255 bytes, with distinct revision hints to force
an R2 read on every miss. The inspector sampled at 100 microseconds. Active samples exclude idle,
program and root frames; sampling overhead and local R2 make these unsuitable as billing figures.

| Case | First miss, elapsed | Nine warm misses, elapsed | Five hits, elapsed | Warm active samples |
| --- | ---: | ---: | ---: | ---: |
| No artwork | 264 ms | 124-136 ms | 3-7 ms | 122-133 ms |
| Bounded large artwork | 499 ms | 311-324 ms | 4-7 ms | 298-316 ms |

The 20-miss allowance represents about 6.3 seconds of sampled rendering work per ten-second window
for this larger local fixture, with room for ordinary bursts at the expected small traffic volume.
It is an operating throttle, not a worst-case CPU proof. The existing 30-second platform limit remains
the final ceiling. Hosted cold starts, actual artwork and per-location rates still need measurement
in [Verify hosted previews, live data and operating costs](https://github.com/ndelangen/dunezone/issues/1721).

## Billing

Every request reaching this Cache API path still invokes the Worker and incurs its request charge
and the CPU used for routing and cache access. Hits avoid application rendering, PNG generation and
metadata queries; they are not free Worker requests. Cache API access adds no separate storage
charge. Unrelated static asset delivery retains its existing routing and billing.

Cloudflare also offers Workers Cache before Worker execution. Enabling it globally would change
billing for otherwise free static assets. Isolating it behind another entrypoint adds a second
Worker invocation on this design's requests. The explicit Cache API keeps this change small and
scoped to the public routes. The later hosted cost ticket measures real traffic shapes and CPU;
local elapsed time and profiler samples are not hosted billable CPU.

Sources checked on 3 October 2026:

- [Cache API behavior and locality](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Workers request and CPU pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers Cache billing](https://developers.cloudflare.com/workers/cache/)
- [Per-entrypoint Workers Cache configuration](https://developers.cloudflare.com/workers/cache/configuration/)
- [Rate-limit locality and approximation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
