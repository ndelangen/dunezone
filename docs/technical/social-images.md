# Social images

Public faction, asset, ruleset and Rulebook detail HTML points `og:image` and `twitter:image` at `/social/image.png`.
The page's existing anonymous result supplies every URL field. The endpoint reads the current JPEG
from the existing publication bucket, lays out the selected A card as SVG, and rasterizes a 1200 by
630 PNG. It makes no Convex call, follows no external image URL, and launches no browser.

[Satori's standalone entry](https://github.com/vercel/satori#using-webassembly) handles layout with
bundled Yoga WASM. resvg WASM encodes the PNG. Satori 0.26.0 and resvg 2.6.2 are pinned after testing
in workerd. The newer Satori tested in the spike failed in that runtime; upgrades must pass the real
Worker test. Candara and Copperplate ship as font modules. Latin letters, accents and punctuation
use those fonts; there is no network font or emoji lookup. Unsupported characters use the fonts'
missing-glyph behavior. Text is passed as text nodes, never raw SVG markup.

## Input and artwork bounds

The shared `socialCard` contract owns parsing and URL construction. It rejects unknown and duplicate
fields before any read or rendering work. Text normalizes to NFC with collapsed whitespace. The
producer truncates long source text; the endpoint rejects text beyond its bounds. The canonical URL
builder fixes parameter order for the edge cache.

| Field | Bound |
| --- | --- |
| Entire URL | 4,096 characters |
| Template `v` | Exactly `1` |
| Name | 78 Unicode code points |
| Kind label | 40 Unicode code points |
| Excerpt | 180 Unicode code points |
| Shape | Round, portrait or landscape |
| Artwork | Up to 180 characters, a supported stable publication path |
| Revision hint | Up to 64 letters, digits, underscores, dots, colons or hyphens |

Artwork is limited to faction tokens, treachery and spice cards, deck cardbacks, cardback presets,
the four token types, published Rulebook first pages and content-addressed user-image JPEGs.
Rulebooks use the selected published Edition's first page, including historical Edition links.
Rulesets use their stored cover thumbnail. User images are read from their existing bucket;
published first pages use the publication bucket. Neither path fetches external cover URLs. The shared publication contract validates the identity and constructs the
R2 key. PDFs, private component envelopes and arbitrary URLs are rejected. One direct R2 range read
is capped at 2,000,001 bytes; objects over 2,000,000 bytes use the fallback. JPEG headers must declare
positive dimensions no greater than 2,048 per axis and 2,000,000 total pixels before decoding starts.

Missing, oversized, unreadable or unavailable artwork uses the selected Dune Zone monogram. Bundles
without a published preview use it too. The artwork fits inside its frame. A long name uses smaller
type and less excerpt space. Text need not identify a real faction or belong to the caller.

The revision parameter changes the URL for a new page result. It does not resolve a historical
publication. Regenerating an old URL reads today's JPEG, as agreed. Nothing writes a social snapshot,
PNG object, Publication job or save hook. Artwork reaches Satori as an ArrayBuffer, bypassing its
persistent data-URL cache. Each resvg renderer and rendered image is freed after use. A fitted
monogram sits behind the opaque JPEG, so a silent decoding failure reveals it. If artwork causes a
render exception, the request retries once without artwork.

## Verification and operating work

`social-image.runtime.test.ts` bundles the real handler and runs it in workerd with a local R2 bucket.
Every outbound HTTP request fails and is counted. It checks PNG dimensions, real artwork pixels,
changed words, replacement artwork at the same URL, deletion, regeneration, corrupt JPEGs, long
text and layout shapes. It also renders 60 distinct JPEGs near the byte limit in one isolate. The expected outbound count is zero. Unit tests cover invalid inputs and artwork bounds.
`publisher:application-runtime:verify` also follows the actual HTML image URLs through the assembled
publisher Worker and decodes their PNG headers.

Cloudflare caches PNGs for one day, recognized fallbacks for five minutes, and existing artwork for
one hour. Hits avoid rendering and R2 reads. Misses make at most one existing-object R2 read, and
cards with different text can share artwork. Missing artwork references perform no read. Browser
page visits do not themselves fetch the Open Graph image. There are no additional metadata queries,
persisted social objects or image transformation service charges on this path.
See [public response caching](public-response-cache.md) for expiration, operating limits and billing.
