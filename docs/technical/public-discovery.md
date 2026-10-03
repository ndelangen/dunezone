# Public page discovery

`/robots.txt` advertises `https://dune.zone/sitemap.xml`. The sitemap index points to a static
landing-page sitemap, a faction sitemap and one sitemap per live Asset type. Each uses absolute
production URLs. Planned types, editors and login-required pages are absent.

Each collection sitemap reads the existing non-deleted index in batches of at most 200 records,
with a two-megabyte database read target per batch. The query returns only the current slug and
last-modified date. Factions and supported assets are public in the current model; ownership and
Group membership do not hide their detail pages. Missing artwork does not make a page unavailable.
A new visibility rule must also narrow this query before private content is introduced.

Discovery does not use the catalogue's capped listing and does not change its search, navigation
or projection. Existing server-rendered catalogue links let crawlers discover visible entries;
the sitemaps cover records beyond those initial listings. Catalogue pagination remains owned by
[Database-backed catalogue pagination](https://github.com/ndelangen/dunezone/issues/416).

Each sitemap has an independent five-minute Cloudflare cache, keyed by application release.
Queries and cookies in the incoming URL do not change the XML. Cache hits make no database calls.
The index and landing-page sitemap never query the database. GET and HEAD share cached bytes.
The browser-facing cache policy remains `no-store`, as for public HTML.

## Bounds and failure behavior

One collection sitemap may contain at most 50,000 URLs and eight megabytes of entry XML. A scan
also stops after 500 batches or 30 seconds. A database page may end early at its byte bound;
the next cursor continues from that point. A stalled cursor, failed read or exceeded bound returns
503 with a five-minute retry hint. Partial XML is never served or cached. These are capacity
limits, not silent result caps. Growth beyond them requires subdividing that collection's sitemap.
There is no background job, saved snapshot or new storage product.

The scan is live rather than a database snapshot. Concurrent changes can appear on a later cache
refresh. This follows the map's accepted lag tolerance. Last-modified values use the record's
`updated_at`, never the sitemap generation time. Invalid dates are omitted, and landing pages have
no invented modification time. Dates describe edits to the record, not changes to linked artwork.

## Canonical and indexing rules

- Public detail pages name their current slug URL as canonical. Asset URLs include their type.
- Search, filter and sort variants retain their working browser URLs but point to the unfiltered
  catalogue as canonical. They are not listed separately in sitemaps. No robots rule prevents a
  crawler from reading their canonical tag.
- A rename moves the public address without preserving a redirect. Old slugs, deleted records and
  unknown public descendants return 404. Five-minute HTML and sitemap caches may briefly retain
  the old response, as already accepted for public delivery.
- Successful public HTML carries no `noindex`. Social PNGs and publisher health diagnostics carry
  `X-Robots-Tag: noindex`. Social URLs still return PNG bytes, including for social-platform fetches.
- Sitemap responses carry XML content types and `X-Robots-Tag: noindex`. Unknown sitemap names
  return 404 instead of the application shell. Unsupported methods return 405.

Google treats sitemaps as discovery hints, not an indexing guarantee. Its
[sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
requires absolute URLs, XML escaping and bounded files, and recommends accurate modification dates.
The [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
supports canonical links and consistent sitemap URLs for duplicate variants. Neither mechanism
promises rankings or a date when a page will enter search results.
