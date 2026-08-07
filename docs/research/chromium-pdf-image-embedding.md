# How Chromium print-to-PDF embeds and rasterizes images

Date: 2026-08-06

Research for [#251](https://github.com/ndelangen/dunezone/issues/251), feeding the PDF size
spike ([#256](https://github.com/ndelangen/dunezone/issues/256)). The pipeline under study is
Playwright `page.pdf()` in [`workers/publisher/browser.ts`](../../workers/publisher/browser.ts)
on Cloudflare Browser Rendering's managed Chromium, rendering the faction sheet whose
[`Background.tsx`](../../src/game/assets/utils/Background.tsx) draws one texture JPEG through
~7 SVG `<pattern>`/`<mask>` instances with a
`grayscale() invert() contrast() blur()` filter on the pattern `<image>`.

Sources are Chromium and Skia `main` as fetched on 2026-08-06 (line numbers cited against
that snapshot), the Chrome DevTools Protocol docs, Playwright docs, and Cloudflare's Browser
Rendering docs. The behavior of Cloudflare's pinned Chromium build may differ from `main`;
everything marked "verify in spike" below is on #256's list.

## The pipeline in one paragraph

Playwright `page.pdf()` issues CDP `Page.printToPDF`
([Playwright `page.pdf`](https://playwright.dev/docs/api/class-page#page-pdf), which also
switches rendering to `print` CSS media by default). Chromium's headless print path builds
`printing::PrintSettings` with `set_dpi(printing::kPointsPerInch)` — 72 DPI layout units
([`components/printing/browser/print_to_pdf/pdf_print_utils.cc:106`](https://github.com/chromium/chromium/blob/main/components/printing/browser/print_to_pdf/pdf_print_utils.cc)).
The renderer records the page as Skia paint records; the print compositor service replays them
into Skia's PDF backend, created by `printing::MakePdfDocument` with a hardcoded
`metadata.fRasterDPI = 300.0f`
([`printing/common/metafile_utils.cc:415-442`](https://github.com/chromium/chromium/blob/main/printing/common/metafile_utils.cc)).
Skia's PDF document then decides, per drawn image, whether to pass encoded bytes through,
re-encode, or rasterize.

## 1. JPEG passthrough vs re-encode; PNG and AVIF

The decision lives in `serialize_image`
([`src/pdf/SkPDFBitmap.cpp:371-399`](https://github.com/google/skia/blob/main/src/pdf/SkPDFBitmap.cpp)):

1. **JPEG passthrough.** If the `SkImage` still carries its original encoded bytes
   (`img->refEncodedData()`), `do_jpeg` embeds those bytes *byte-for-byte* as a `DCTDecode`
   XObject — no recompression, no quality knob involved. Passthrough requires **all** of
   (`SkPDFBitmap.cpp:287-344`):
   - the document has a JPEG decoder callback (Chromium gets Skia's default:
     `SkPDF::MakeDocument` fills `jpegDecoder`/`jpegEncoder` with `SkPDF::JPEG::Decode/Encode`
     when unset,
     [`src/pdf/SkPDFDocument.cpp:720-724`](https://github.com/google/skia/blob/main/src/pdf/SkPDFDocument.cpp));
   - the data actually decodes as JPEG with matching dimensions;
   - color type is **YCbCr or grayscale** — CMYK JPEGs fail the `goodColorType` check;
   - EXIF orientation is top-left (any EXIF rotation kills passthrough).

   ICC profiles from the codec (or the image's color space) are embedded alongside as an
   `ICCBased` color space. The encoded bytes survive Chromium's cross-process print
   serialization: `GetImageData` skips re-encoding when `refEncodedData()` is present, and
   only PNG-encodes images that have no encoded origin
   ([`printing/common/metafile_utils.cc:390-403`](https://github.com/chromium/chromium/blob/main/printing/common/metafile_utils.cc)).

2. **JPEG re-encode** happens only when passthrough failed **and**
   `fEncodingQuality <= 100` **and** the image is opaque (`SkPDFBitmap.cpp:390-397`).
   Chromium never sets `fEncodingQuality`, so it stays at the default **101 = lossless**
   ([`include/docs/SkPDFDocument.h:159`](https://github.com/google/skia/blob/main/include/docs/SkPDFDocument.h)).
   **In Chromium this branch is dead code**: there is no launch flag, CDP parameter, or
   Playwright option that reaches it.

3. **Everything else is deflated raw pixels.** PNG, AVIF, WebP, GIF, canvas/rasterized
   content, and any JPEG that failed passthrough are decoded to 8-bit BGRA and written as
   zlib-compressed (`FlateDecode`) raw RGB, with a separate deflated 8-bit alpha `SMask`
   when not opaque (`do_deflated_image`, `SkPDFBitmap.cpp:203-285`). PNG is **not** embedded
   as PNG — PDF has no PNG filter — and Skia's flate stream uses no PNG-style predictors, so
   the embedded bytes are routinely several times larger than the source PNG/AVIF file.

Duplicate draws of the *same* `SkImage` are embedded once: the document caches XObjects per
image key in `fPDFBitmapMap`
([`src/pdf/SkPDFDevice.cpp:1852-1860`](https://github.com/google/skia/blob/main/src/pdf/SkPDFDevice.cpp)).
Seven unfiltered `<img>`/`<image>` references to one texture would share one embedded JPEG.
Seven *separately rasterized filter results* are seven distinct images — no dedup.

**Version caveat (verify in spike):** the `jpegDecoder`-callback design landed in Skia in
2023; before that, passthrough was gated on `fEncodingQuality > 100` and a stricter header
scan. Current `main` attempts passthrough regardless of quality and does not reject
progressive JPEGs explicitly (only color type + orientation). Whether Cloudflare's pinned
build passes progressive JPEGs through should be confirmed empirically.

## 2. When SVG `<pattern>` / filtered content rasterizes, and at what DPI

PDF has no filter or compositing model rich enough for CSS/SVG filters, so Skia's PDF device
rasterizes them:

- **Any saveLayer with an image filter or color filter becomes a raster layer.**
  `SkPDFDevice::createDevice` returns a plain `SkBitmapDevice` whenever the layer paint has
  an `ImageFilter` **or** `ColorFilter`
  ([`src/pdf/SkPDFDevice.cpp:302-316`](https://github.com/google/skia/blob/main/src/pdf/SkPDFDevice.cpp)).
  Blink lowers `filter: grayscale(...) ... blur(...)` on the pattern `<image>` to exactly
  such layers, and SVG `<mask>` also goes through a luminance color-filtered layer — so in
  our `Background.tsx` both the filtered texture *and* the mask application are raster
  layers, not vector content.

- **Raster resolution is `fRasterDPI`, and Chromium hardcodes 300.** The PDF page canvas is
  pre-scaled by `fRasterDPI / 72`, so bitmap layer devices are allocated at that scale — the
  in-source comment says explicitly that layers are created "at the rasterized scale, not
  the 72dpi scale"
  ([`src/pdf/SkPDFDocument.cpp:271-305`](https://github.com/google/skia/blob/main/src/pdf/SkPDFDocument.cpp),
  `fRasterScale` at 241-242). With Chromium's `fRasterDPI = 300`
  ([`metafile_utils.cc:422`](https://github.com/chromium/chromium/blob/main/printing/common/metafile_utils.cc)),
  filtered content rasterizes at **300 px per inch of final page** ≈ 3.125 raster px per CSS
  px (96 CSS px/in). A stale comment in `createDevice` mentions "100dpi"; the page-scaling
  code is what actually executes.

- **Unsupported shaders rasterize with a ~1-megapixel clamp.** Image shaders with
  repeat/mirror tiling can become native PDF tiling patterns
  (`SkPDFShader.cpp:82-268`), but any shader the backend can't express (picture-record
  shaders, which is how SVG `<pattern>` content is often carried) falls back to
  `make_fallback_shader`: shade the covered device-space area into a bitmap, **clamped to
  `kMaxBitmapArea = 1024*1024` pixels** by uniform downscale
  ([`src/pdf/SkPDFShader.cpp:270-330`](https://github.com/google/skia/blob/main/src/pdf/SkPDFShader.cpp)).
  A full A4 area at 300 DPI wants ~8.7 Mpx, so a fallback-shader path would be downscaled
  ~3× — visibly soft — while the saveLayer path keeps full 300 DPI. Which path our
  pattern+mask combination actually takes is a spike question.

**What does and does not influence the raster DPI:**

| Knob | Effect |
| --- | --- |
| `fRasterDPI` | The lever — but hardcoded 300, no flag/CDP/Playwright exposure |
| Paper size / `preferCSSPageSize` / CSS `@page` | Sets page area in points → total raster pixels (area × 300 DPI), not density |
| `scale` (CDP/Playwright) | Scales layout within the fixed page; changes how much content area gets rasterized, not the DPI |
| Viewport size | Print layout uses paper size, not viewport; affects only JS/viewport-unit-driven layout before capture |
| `deviceScaleFactor` | Should not affect print raster density (print uses its own 72-unit space, `pdf_print_utils.cc:106`); it does affect `srcset`/`image-set` selection and canvas backing stores. Verify in spike |
| Print emulation (`emulateMedia`) | Chooses print CSS; no DPI effect |
| Launch flags | `--rasterize-pdf-dpi` exists but applies to printing *existing PDFs* via the PDF viewer, not to `printToPDF` output. No flag reaches `fRasterDPI` |

`Page.printToPDF` exposes layout-only parameters (paper, margins, scale, ranges, header /
footer, `preferCSSPageSize`, `generateTaggedPDF`, `generateDocumentOutline`, `transferMode`)
— **no image quality, compression, or DPI parameter of any kind**
([CDP Page.printToPDF](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF)).

### Consequence for the faction sheet

The texture JPEG's passthrough eligibility is irrelevant today: the filter + mask force each
pattern instance through raster layers, producing large `FlateDecode` RGB images (plus alpha
SMasks) — with no dedup across the ~7 instances because each raster is a distinct image.
That, not the source JPEG's size, is the dominant size mechanism to confirm in the spike.

## 3. Levers to shrink embedded image bytes

Available everywhere (including Cloudflare):

1. **Pre-bake the filter treatment into the asset.** Apply
   grayscale/invert/contrast/blur offline (build-time per `definition`/`invert` bucket, or
   once at runtime via canvas → JPEG blob) and drop the SVG filter/mask at print time. Then
   the texture is a plain opaque JPEG draw: byte-for-byte passthrough + a single shared
   XObject across all instances. This is the only lever that changes the mechanism rather
   than the constants.
2. **Optimize the source JPEG itself** (dimensions, quality, baseline, no EXIF rotation,
   YCbCr not CMYK). Only pays off once passthrough applies; while filters force
   rasterization, embedded size depends on rasterized page area, not source bytes.
3. **Shrink the rasterized area**: fewer/smaller filtered regions, or one full-page
   background layer instead of ~7 overlapping instances.
4. **Post-process the PDF** after capture: downsample/JPEG-recompress Flate image XObjects
   (Ghostscript/mupdf-class tooling). Inside a Worker this means WASM builds and real CPU/
   memory cost against Browser Rendering + Worker limits; more realistic as a separate
   processing step than in the publisher hot path.

Unavailable in Cloudflare's managed Chromium (`@cloudflare/playwright`):

- **Any Chromium launch flag.** `launch(binding)` takes the binding, not `args`; Cloudflare
  runs a managed, pinned Chromium (only Chrome is supported, "different versions of Chrome"
  explicitly unsupported;
  [Cloudflare Playwright docs](https://developers.cloudflare.com/browser-rendering/platform/playwright/),
  [limits](https://developers.cloudflare.com/browser-rendering/platform/limits/)). Not that
  flags would help: no flag reaches `fRasterDPI` or `fEncodingQuality` anyway.
- **Skia metadata knobs** (`fRasterDPI`, `fEncodingQuality`, `fCompressionLevel`) — not
  exposed by any Chromium build, headless or otherwise.
- **CDP escape hatches** — `Page.printToPDF` simply has no image parameters, so raw CDP
  access buys nothing here.

## What the spike (#256) should verify empirically

1. **Chromium/Skia version in Cloudflare Browser Rendering** (`browser.version()`), since all
   line citations are against `main`.
2. **Anatomy of the current faction-sheet PDF**: per-XObject filter type
   (`DCTDecode` vs `FlateDecode`), pixel dimensions, byte sizes, and count — does the
   texture appear ~7× as rasterized layers? Are layers at 300 DPI (full-page ≈ 2480×3508)
   or 1 Mpx-clamped fallback-shader tiles (≈ 3× downscaled)? Extend
   [`workers/publisher/pdf-inspection.ts`](../../workers/publisher/pdf-inspection.ts) or use
   a local script.
3. **JPEG passthrough proof**: render the texture unfiltered and confirm the embedded
   `DCTDecode` stream byte-matches the source file, and that N references share one XObject.
4. **Progressive JPEG** passthrough in the deployed build (version-dependent, see §1).
5. **`deviceScaleFactor` invariance**: same page at dsf 1 vs 2 → identical PDF image
   dimensions expected.
6. **Pre-baked treatment quality**: does an offline grayscale/invert/contrast/blur bake
   visually match the live SVG filter chain at print size, and what is the resulting PDF
   size?

## Conclusion

Chromium's print-to-PDF embeds original JPEG bytes untouched whenever the image reaches Skia
unfiltered, undecoded, un-rotated, and non-CMYK; everything else — including every PNG/AVIF
and every pixel touched by a CSS/SVG filter or mask — becomes zlib-compressed raw RGB. Filtered
content rasterizes at a hardcoded 300 DPI of page area (with a ~1 Mpx clamp on fallback
shader tiles), and neither Playwright, CDP, nor Cloudflare's managed Chromium exposes any
knob over raster DPI or image encoding. The practical lever for the faction sheet is to move
the texture treatment out of print-time filters so the pipeline's passthrough + dedup path
can do its job.
