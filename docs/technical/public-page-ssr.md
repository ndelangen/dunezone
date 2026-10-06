# Public page HTML and live data

The [hosted delivery rehearsal](public-delivery-rehearsal.md) records measured CPU, browser behavior,
external scraper results and the current cost model. It supersedes the preliminary cost assumptions below.

Faction details, asset details, rulesets, published Rulebook readers, their catalogues and asset-type listings render anonymous HTML
in the publisher Worker. Login-required pages keep their browser-only loaders. The Worker strips
visitor credentials before invoking TanStack Start, and the data doorway creates an unauthenticated
HTTP client for server reads.

Each route calls its existing page query once. That result supplies the visible content, title,
canonical URL, description and social metadata. The faction excerpt comes from its first advantage;
an asset uses About. Formatting marks become readable text, and empty excerpts remain empty.
Descriptions stop at 200 Unicode code points. Detail metadata points to [the social PNG endpoint](social-images.md).
Its URL carries bounded words and the existing published artwork path. Catalogues retain the site
poster. Image generation adds no metadata query.

The browser hydrates the anonymous result and starts the existing Convex subscriptions. A live
result replaces the initial data, including a null result after deletion. Edit and membership
controls wait for current capabilities. Signing out removes them; the initial data cannot grant
access while the next subscription result is pending. Live names update the browser title. Asset
dates use a stable calendar date so the server and browser agree during hydration.

The [public discovery contract](public-discovery.md) covers robots.txt, sitemaps and canonical URL variants.

Missing records and unknown public descendants return 404. A faction query reports structured
`NOT_FOUND` so a connection failure cannot masquerade as absence. A faction that disappears from
an open page uses the same absence presentation. Old slugs remain absent after a rename.

Cloudflare caches successful anonymous HTML for five minutes, keyed by Worker version and normalized
URL. Credential-bearing and anonymous visits share the same anonymous rendering. Credentials are
removed before loading, and responses with Set-Cookie, private cache directives, Vary or non-200
status cannot enter the cache. Browser responses remain `no-store`, so each visit reaches the Worker
and existing live subscriptions still start immediately. Cache eviction or failure causes
a fresh render. See [public response caching](public-response-cache.md) for limits and diagnostics.
No new client cache, saved snapshot or save-triggered HTML generation exists here.

## Read-work measurement

A controlled `convex-test` measurement ran the actual anonymous page functions with one authored
faction, one treachery card and one owner profile. It used `ctx.meta.getTransactionMetrics()` around
each query. These are fixture measurements, not production usage or billing estimates.

| Page | Function calls | Documents read | Database bytes read | Index ranges | Result JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Faction detail | 1 | 3 | 5,611 | 5 | 3,503 |
| Asset detail | 1 | 3 | 1,492 | 6 | 1,342 |
| Faction catalogue | 1 | 1 | 2,645 | 3 | 2,494 |
| Asset catalogue | 1 | 2 | 848 | 15 | 843 |
| Asset-type listing | 1 | 2 | 848 | 2 | 875 |

One function call does not mean one database read. Catalogue work grows with its entries; container
assets also read members, related containers, publication state and maintaining-group information.
The existing queries keep their bounds. Metadata adds no lookup of its own. A browser additionally
starts its normal live page and session subscriptions, whose work is separate from this table.

`publisher:application-runtime:verify` checks the assembled Worker against public catalogues, entity details, Rulesets and published Rulebooks,
profiles, Groups and FAQ questions,
including detail links discovered from catalogue HTML. It also verifies complete documents, metadata,
hydration scripts, real 404s, browser-only paths and protected capture delivery. Local browser checks
exercise hydration and live updates against a disposable backend; production checks remain read-only.

Rulesets use their About text, with a short reading invitation when it is empty. Rulebook cards
name the ruleset and the selected Edition. The reader query adds the selected Edition's published
first-page URL; it never reads draft content for that image. Explicit Edition links retain their
Edition in the canonical URL, while text-selection locators and page anchors do not change it.
Ruleset and Rulebook dates use fixed calendar labels so cached HTML and hydration agree.

## Community pages

Profile details, the profile directory, Group details and FAQ questions use the same anonymous
HTML cache and live subscriptions. Profile cards use the stored avatar when present; Group cards
include public member, faction and Ruleset counts. FAQ cards use the question and accepted-answer
status. Dates use fixed calendar labels so cached markup hydrates consistently.

Missing profiles, Groups and FAQ questions return structured `NOT_FOUND` errors. Their loaders
translate only that code to HTTP 404; permission, transport and data failures remain errors.
Deploy these additive backend errors before the browser release. The assembled release check uses
the currently deployed backend, so it checks successful community pages before rollout; missing
community records are also verified against the new backend during release validation.
