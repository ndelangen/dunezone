# Spike: what actually drives faction-sheet PDF size (wayfinder #256)

Local Playwright capture of the reference fixture (`assetPublishingFaction`, 5 leaders + 1 troop)
through the exact publisher contract (viewport 2100×2970, dsf 1, `preferCSSPageSize`,
`printBackground`), followed by pdf-lib anatomy of every image XObject. Harness:
`spike-pdf-run.ts` (matrix), `spike-pdf-recompress.ts` (passthrough probe + estimates),
`spike-pdf-rewrite.ts` (real recompressed PDFs — the #259 approach executed locally).

## Findings

1. **Source resolution is irrelevant to PDF size.** Full-res (3648²) vs 1280 vs 640 texture:
   byte-identical PDFs (±2 KB). `deviceScaleFactor` 1 vs 2: identical. Confirms #251's
   fixed-DPI rasterization.
2. **Pre-baking the filter is dead.** Serving pre-filtered textures + stripping the SVG filter
   attribute produced zero DCTDecode streams — SVG `<pattern>` + mask structure rasterizes
   regardless of filters. (Baked cells were *larger*: inverted grayscale Flates worse.)
   DCT passthrough itself is real — a bare `<img>` JPEG probe embeds byte-for-byte — but the
   sheet's rendering structure never qualifies, and render-structure changes are off-limits.
3. **Effects are not the lever either.** Inventory: 16 filter instances, 19 masked elements,
   0 box-shadows. Stripping every filter+shadow removed only 18 of 61 images (~117 KB).
   The masks (unstrippable — they're structural) keep everything rasterized.
4. **Anatomy of the 1757 KB baseline:** 61 image XObjects, all lossless FlateDecode,
   1656 KB total (94%). Five leader portraits (367×369 RGB/ICC): ~900 KB. Five to seven
   grayscale texture tiles (~429×426): ~530 KB. ~45 small mask-pair fragments (names,
   plates, logos): ~200 KB. Non-image overhead (fonts, content streams): ~101 KB.
5. **Post-capture recompression is the lever, with a safety rule.** Rewriting Flate → JPEG
   in place works, but two classes must never be touched: images with an `/SMask` entry and
   anything under 300 px in either dimension (re-encoding the wide-short name-shape masks
   erases the engraved leader names; discovered empirically at q85/q90). The safe target set
   is exactly the big square-ish art rasters: portraits + tiles.

## Results (targeted-safe policy, real rewritten PDFs)

| Variant | KB | Verdict at screen scale + 200% zoom |
|---|---|---|
| baseline (lossless) | 1757 | reference |
| **q90 uniform, full-res** | **554** | **indistinguishable — no seams, names intact** |
| mixed q85 portraits / q70 tiles | 485 | pattern-tile seam visible on some tokens |
| q70 uniform, full-res | 455 | same seam, slightly washed tiles |
| q80/q75 half-res | 383/373 | rejected — moiré striping on tiles and portraits |

Downsampling and q<~85 tiles both break the seamless pattern tiling. The floor with the safe
policy is ~450 KB; going below ~350 KB requires touching mask pairs (breaks text) or changing
how the sheet renders (ruled out). The 200 KB aspiration is **not reachable safely**; 550 KB
(a 3.2× shrink, and far below the multi-MB dealbreaker) is, with pixel-fidelity intact.
Sizes scale with leader count; this fixture is typical.

## Verdict (Norbert, HITL)

Grain fidelity on the texture tiles is non-negotiable — the pattern is faction identity.
JPEG at q90 *and* q95 both leave visible directional streaks in the tile grain at zoom
(the troop token, whose tile fell under the 300 px threshold and stayed lossless, was the
tell). **Accepted candidate: `tiles-lossless-portraits-q90.pdf` — texture tiles byte-identical
to baseline, only the five RGB portraits re-encoded at q90: 1757 → 978 KB (1.8×).**

Final safe recompression rule for the production tool (#259 design):
re-encode **only RGB images ≥300 px in both dimensions without an /SMask entry**
(in practice: leader portraits). Grayscale images (texture tiles, masks), mask pairs,
and anything small stay lossless. JPEG-on-noise is the boundary this spike mapped:
photographic content compresses invisibly at q90; isotropic grain does not, at any q tried.

## Final policy (#257, decided on production data)

The fixture-era verdict was superseded after testing on a real production PDF
(faction-test.pdf, 3824 KB — bigger portraits than the fixture, incl. a 1024² at 1.4 MB):
**JPEG is banned from the pipeline entirely.** Even q90 4:4:4 on the portraits streaked the
paper-grain in their backgrounds — the same failure as the tiles, because this art style is
grain everywhere. The safe verb is **lossless downsampling**: resize + re-deflate, still
FlateDecode. Decided policy: RGB rasters (≥300px both dims, no /SMask) → lossless 0.35×;
grayscale tiles and all fragments byte-untouched. Production result: 3824 → 1250 KB (3.05×),
accepted eyes-on at 300 DPI zoom. ilovepdf's 687 KB reference rejected (portraits crushed to
~0.2× with visible posterization; fragments JPEG'd). See `recompress-harness.ts` for the
validated reference implementation; Train 2 implementation ticket: #271.

## Feed-forward to #257 (published PDF policy)

- One recompressed variant (portraits-q90, tiles lossless, ~1 MB for a 5-leader faction)
  is pixel-faithful on pattern grain and visually print-grade — the two-variant question
  may still collapse into one, at ~1 MB rather than the original 200 KB aspiration.
- The #259 Worker recompression design is validated end-to-end on real bytes, including the
  targeted-safe selection rule it must implement (≥300 px both dimensions, no `/SMask` entry,
  skip when JPEG ≥ Flate). Masks stay Flate; ICC colorspaces carry over untouched.
- Chromium XObject shapes matched #259's assumptions: 8-bit, unpredicted Flate, DeviceRGB/
  DeviceGray/ICCBased; zero skips after handling ICCBased as 3-channel.
