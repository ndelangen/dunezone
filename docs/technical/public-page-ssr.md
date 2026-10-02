# Public page HTML and live data

Faction details, asset details, the two catalogues and asset-type listings render anonymous HTML
in the publisher Worker. Login-required pages keep their browser-only loaders. The Worker strips
visitor credentials before invoking TanStack Start, and the data doorway creates an unauthenticated
HTTP client for server reads.

Each route calls its existing page query once. That result supplies the visible content, title,
canonical URL, description and social metadata. The faction excerpt comes from its first advantage;
an asset uses About. Formatting marks become readable text, and empty excerpts remain empty.
Descriptions stop at 200 Unicode code points. Existing published artwork supplies `og:image` until
[the social PNG endpoint](https://github.com/ndelangen/dunezone/issues/1718) replaces it with the
selected card design and bounded URL inputs.

The browser hydrates the anonymous result and starts the existing Convex subscriptions. A live
result replaces the initial data, including a null result after deletion. Edit and membership
controls wait for current capabilities. Signing out removes them; the initial data cannot grant
access while the next subscription result is pending. Live names update the browser title. Asset
dates use a stable calendar date so the server and browser agree during hydration.

Missing records and unknown public descendants return 404. A faction query reports structured
`NOT_FOUND` so a connection failure cannot masquerade as absence. A faction that disappears from
an open page uses the same absence presentation. Old slugs remain absent after a rename.

Responses currently use `no-store`. The separate
[Cloudflare cache ticket](https://github.com/ndelangen/dunezone/issues/1719) adds the agreed five-minute
anonymous HTML cache. It will reduce server query frequency without delaying browser subscriptions.
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

`publisher:application-runtime:verify` checks the assembled Worker against five public page shapes,
including detail links discovered from catalogue HTML. It also verifies complete documents, metadata,
hydration scripts, real 404s, browser-only paths and protected capture delivery. Local browser checks
exercise hydration and live updates against a disposable backend; production checks remain read-only.
