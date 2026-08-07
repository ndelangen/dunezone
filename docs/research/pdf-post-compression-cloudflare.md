# Post-capture PDF compression in Cloudflare infrastructure

Date: 2026-08-06

Research for [#259](https://github.com/ndelangen/dunezone/issues/259), feeding the
published-PDF-policy decision ([#257](https://github.com/ndelangen/dunezone/issues/257)) and
the PDF size spike ([#256](https://github.com/ndelangen/dunezone/issues/256)). Companion to
[chromium-pdf-image-embedding.md](./chromium-pdf-image-embedding.md), which established *what*
the publisher's Chromium emits; this document evaluates the options for producing a compressed
clone of that output inside Cloudflare's infrastructure, after capture, before or alongside the
R2 write in [`workers/publisher`](../../workers/publisher/).

Sources are Cloudflare's Workers and Containers docs, the npm registry, the mupdf and jSquash
projects, and pdf-lib, all fetched 2026-08-06. Cost and CPU figures marked *estimate* have no
primary-source measurement behind them and are on #256's verification list.

## The input, precisely

Per the companion research, Chromium's print path produces exactly two kinds of image XObject:

1. **`DCTDecode` passthrough JPEGs** — original bytes, already compressed. Leave untouched.
2. **`FlateDecode` raw rasters** — 8-bit RGB rows, no predictors, one per rasterized
   filter/mask layer at 300 DPI of page area, plus a separate deflated 8-bit grayscale `SMask`
   XObject when the layer is not opaque. These dominate the faction-sheet PDF's size and are
   the compression target: inflate, optionally downsample, re-encode as JPEG, swap the filter
   to `DCTDecode`.

How safe is the "8-bit RGB Flate" assumption?

- **SMasks: expect them.** Filter/mask layers carry alpha, so the base image will usually have
  an `SMask` entry. That is not an obstacle: `SMask` is a *separate* grayscale image XObject
  referenced from the base image's dictionary (PDF 32000-1:2008 §11.6.5.2, Table 89), fully
  independent of the base image's filter — a `DCTDecode` base with a `FlateDecode` SMask is
  valid. Near-binary masks compress superbly under flate already; the safe default is to leave
  SMasks alone (optionally re-encode large smooth ones as grayscale JPEG later).
- **Indexed color: not emitted.** Skia's `do_deflated_image` writes raw RGB/gray only — no
  `Indexed` palettes ([`SkPDFBitmap.cpp`](https://github.com/google/skia/blob/main/src/pdf/SkPDFBitmap.cpp)).
- **ICC: uncertain for the deflate path.** The companion doc confirmed `ICCBased` embedding for
  JPEG passthrough; whether Chromium's deflated rasters get `DeviceRGB` or an `ICCBased` sRGB
  stream needs a look at a real capture (**verify in spike**). Either way an ICC color space
  survives a filter swap — it lives in `/ColorSpace`, not in the stream.

So the recompressor should **gate defensively rather than assume**: touch only XObjects with
`Subtype /Image`, `BitsPerComponent 8`, `ColorSpace` `DeviceRGB` or 3-component `ICCBased`,
`Filter` exactly `FlateDecode` (single filter, no `DecodeParms` predictors), no `Decode` array,
not an `ImageMask`. Everything else passes through unmodified. Against Chromium's actual output
this gate matches every big raster; against a hand-crafted PDF it degrades to a no-op.

## Platform constraints recap

| Constraint | Value | Source |
| --- | --- | --- |
| Worker memory | 128 MB per isolate, **including WASM allocations**, not raisable | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Worker CPU (HTTP) | 30 s default, `cpu_ms` configurable to 300 000 ms | same |
| Worker CPU (**cron**, interval < 1 h) | **30 s, `cpu_ms` does not raise it** | same |
| Worker bundle | 10 MB compressed (paid) | same |
| Publisher config | `cpu_ms: 30000`, `PDF_MAX_BYTES: 8000000`, cron `*/5`, ≤ ~20 captures per run | [`wrangler.jsonc`](../../workers/publisher/wrangler.jsonc) |

The cron CPU cap is the sleeper constraint: the publisher's capture loop runs from the `*/5`
cron, where CPU is hard-capped at 30 s regardless of `cpu_ms`. Any in-Worker compression that
risks multi-second CPU per PDF should run in an **HTTP-invoked step** (self-`fetch` or a queue
consumer), where `cpu_ms` up to 300 000 applies — an invocation-shape change, not new infra.

## Route 1 — Targeted Worker-side recompression (pdf-lib + native inflate + jSquash)

**Stack.** All license-clean, all small:

- [`pdf-lib` 1.17.1](https://github.com/Hopding/pdf-lib) (MIT, already a publisher dependency)
  exposes the needed low-level surface: `doc.context.enumerateIndirectObjects()`,
  `PDFRawStream` (dict + raw bytes), and `context.assign(ref, newStream)` to swap an object.
  The dict edit is: replace stream bytes with JPEG output, set `Filter /DCTDecode`, drop
  `DecodeParms`, fix `Length` (handled by `PDFRawStream.of`). pdf-lib also exports
  `decodePDFRawStream`, though for Chromium's plain single-flate streams the runtime can do it.
- **Inflate**: the publisher already has `nodejs_compat`, so `node:zlib` is available, and the
  Workers runtime natively supports `DecompressionStream('deflate')`
  ([Workers Web standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/)).
  No pako needed.
- **JPEG encode**: [`@jsquash/jpeg` 1.6.0](https://github.com/jamsinclair/jSquash)
  (Apache-2.0, MozJPEG compiled to WASM, ~0.5 MB unpacked) ships **explicit Cloudflare Workers
  examples** and deliberately avoids runtime features Workers block. `@jsquash/resize`
  (Apache-2.0, ~0.25 MB) covers optional 300→150 DPI downsampling. Bundle impact is negligible
  against the 10 MB limit.

**Memory arithmetic** (the binding constraint). Worst plausible single raster is a full A4 page
layer at 300 DPI ≈ 2480×3506 ≈ 8.7 Mpx: 26 MB as RGB, 35 MB as the RGBA `ImageData` mozjpeg
wants. Processing strictly one image at a time, freeing each buffer as soon as the next stage
consumes it: ~8 MB input PDF + pdf-lib's parsed objects (~2× the file, *estimate*) + 26 MB
inflated + 35 MB RGBA ≈ **85–95 MB peak** — inside 128 MB, but with little headroom, and WASM
heaps count against the same 128 MB. This works only because `PDF_MAX_BYTES` caps input at
8 MB; it does not generalize to arbitrary PDFs. **Verify peak RSS in the spike** with a real
capture under `wrangler dev` and in production observability.

**CPU** (*estimate*). Inflate is cheap; mozjpeg-WASM encode is roughly 0.2–0.5 s per Mpx, so
~2–4 s per full-page raster and possibly ~15–25 s for a 7-layer faction sheet at 300 DPI —
uncomfortably close to 30 s if run inside the cron handler (hence the HTTP-invoked step above).
Downsampling to 150 DPI first quarters the encode input. **Spike: measure ms/Mpx in workerd.**

**Expected compression** (*estimate*). Deflated raw RGB → JPEG q75–85 typically shrinks those
streams 5–15×; with 150 DPI downsampling 20–40×. On a PDF dominated by such rasters, whole-file
reduction of roughly **4–10×** is realistic. Quality at q80/150 DPI vs the current output is a
spike question, not a research one.

**Risks.** pdf-lib is unmaintained (last release 2021) — acceptable here because only the
stable low-level object model is used, not its high-level features; round-trip integrity of a
re-saved Chromium PDF (opens in Acrobat/Preview/Chrome, prints correctly) must be spot-checked
in the spike.

## Route 2 — MuPDF-WASM or Ghostscript-WASM in a Worker

**MuPDF.** The official [`mupdf` npm package](https://mupdf.readthedocs.io/) (Artifex, 1.28.0)
is a real, maintained WASM binding: 14.3 MB unpacked (WASM ~10 MB, plausibly ~3–4 MB gzipped —
*estimate*, but likely inside the 10 MB compressed bundle limit). Its `PDFObject` API
(`readStream`/`writeStream`, which auto-manage `Length`/`Filter`/`DecodeParms`) would make the
Route 1 rewrite more robust than pdf-lib. **But it does not remove the hard part**: MuPDF's
[PDF write options](https://mupdf.readthedocs.io/en/latest/reference/common/pdf-write-options.html)
offer `garbage`, `compress`, `compress-images` (flate/CCITT of existing data) — **no image
downsampling and no JPEG re-encoding on save**. You would still bring `@jsquash/jpeg` for the
DCT step. So MuPDF buys a sturdier parser, nothing more.

**The price is AGPL.** `mupdf` is `AGPL-3.0-or-later` (dual-licensed commercially by Artifex).
Linking it into the publisher Worker makes the Worker a combined work; AGPL §13 then requires
offering the complete corresponding source of that combined work under AGPL to everyone who
interacts with it over the network. The repo is public but currently has **no license file**,
so this would force an explicit AGPL grant for the publisher (or a paid Artifex license). That
is a real project-licensing decision, not a technicality — and it is not worth it for a parser
upgrade. Verdict: **fallback only**, if the spike shows pdf-lib mangling Chromium's output.

**Ghostscript-WASM: not credible.** There is no official build. Community npm builds are stale
or alpha (`@jspawn/ghostscript-wasm` 0.0.2, 2022, AGPL, 16.3 MB unpacked;
`@privyid/ghostscript` 0.1.0-alpha, 2024, AGPL, 19.5 MB). A full `-dPDFSETTINGS` pipeline
under Emscripten needs an emulated filesystem and working memory that has to fit — with the
input and output PDFs — inside the same 128 MB isolate; the bundle alone flirts with the 10 MB
compressed limit. AGPL applies identically. Dismissed.

## Route 3 — Cloudflare Containers running real Ghostscript

**Status: GA.** Containers left beta on 2026-04-13
([changelog](https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/)),
on the Workers Paid plan. A container class is bound to the Worker; the publisher would
`getContainer(env.COMPRESSOR, id).fetch(pdfBytes)` and write the response to R2. Instance
types range from `lite` (1/16 vCPU, 256 MiB) to `standard-4`
([limits](https://developers.cloudflare.com/containers/platform-details/limits/)); `basic`
(1/4 vCPU, 1 GiB) is comfortable for 8 MB PDFs. Instances scale to zero and bill per 10 ms of
active runtime ([pricing](https://developers.cloudflare.com/containers/pricing/)).

**Capability: the strongest of all routes.** Native Ghostscript
(`gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook`, i.e. 150 DPI downsample + DCT re-encode) is the
canonical tool for exactly this job. It handles SMasks, ICC, indexed color, and every edge case
itself — no Chromium-shape assumptions needed — and routinely shrinks lossless-raster-heavy
PDFs **5–15×** (*estimate*, consistent with Route 1's arithmetic since it performs the same
transform plus stream-level cleanup).

**Cost: pennies.** Even at the theoretical ceiling — 20 captures per 5-min cron around the
clock (5 760/day) at ~5 s each on `basic` — usage is ~240 GiB-hours/month of memory and
~60 vCPU-hours/month, landing at roughly **$6/month** after the included allotment (25
GiB-hours, 375 vCPU-minutes); realistic capture volume is a small fraction of that. Cold
starts are seconds — irrelevant for a cron-driven batch.

**Licensing: manageable, with a flag.** Unlike Route 2, Ghostscript here runs as an
**unmodified standalone binary in a separate process**; the publisher talks to it over
exec/HTTP, which the FSF treats as mere aggregation, not a combined work
([GPL FAQ, "MereAggregation"](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)).
Ghostscript's *output* PDFs are not covered by its license. Compliance then means being able to
provide the unmodified Ghostscript source (trivial — it is public). Caveat worth naming:
Artifex historically interprets its licenses aggressively and monetizes via commercial
licensing; the separate-process argument is standard and strong, but this is the one route
where a lawyer-grade check would be prudent if the project ever commercializes.

**Complexity: the real cost.** A new deployable: Dockerfile (alpine + ghostscript ≈ 60 MB,
well under limits), image build/push in CI, container class + binding in `wrangler.jsonc`, a
tiny HTTP shim inside the container, and observability for a second runtime. None of it is
hard; all of it is surface area the project does not currently have.

## Route 4 — Managed / third-party APIs (briefly)

[Adobe PDF Services' Compress PDF](https://developer.adobe.com/document-services/docs/overview/limits)
has a free tier of 500 document transactions/month — an order of magnitude under the
publisher's theoretical ceiling (5 760 captures/day), with pay-as-you-go around $0.05 per
transaction beyond it. CloudConvert, iLovePDF and similar are priced per operation in the same
ballpark. All of them ship the PDF out of Cloudflare to a third party, add per-document cost
that dwarfs Route 3, and add an external dependency to the capture path. Not competitive here;
only sensible for a team unwilling to run any processing of its own.

## Recommended ranking

1. **Route 1 — targeted pdf-lib + jSquash recompression in the Worker.** Cheapest, zero new
   infrastructure, MIT/Apache only, and viable precisely because the companion research proved
   the input is Chromium's narrow, predictable shape and `PDF_MAX_BYTES` bounds it at 8 MB.
   Run it as an HTTP-invoked step (not inside the cron handler) to escape the 30 s cron CPU
   cap. This is what the spike (#256) should build.
2. **Route 3 — Containers + Ghostscript.** The upgrade path if the spike shows Route 1
   breaching memory/CPU or mangling output — and the automatic answer the day the PDFs stop
   being predictable (bigger pages, arbitrary content, >8 MB inputs). More robust compression
   than Route 1, ~$0–6/month, but a second deployable and a licensing posture to document.
3. **Route 2 — MuPDF-WASM.** Only as a parser fallback inside Route 1's design, and only if
   pdf-lib proves unreliable; it still needs jSquash for the actual DCT step and drags AGPL
   into the Worker bundle. Ghostscript-WASM: rejected outright.
4. **Route 4 — managed APIs.** Rejected: cost, data egress, external dependency.

## What the spike (#256) should verify empirically

1. **XObject anatomy of a real capture** (already on #256's list): confirms Route 1's
   defensive gate matches every large raster — filter, color space (`DeviceRGB` vs
   `ICCBased`), `BitsPerComponent`, SMask presence.
2. **Peak memory** of parse→inflate→RGBA→encode on the largest real raster inside workerd,
   one image at a time, against the 128 MB isolate limit.
3. **mozjpeg-WASM throughput** (ms/Mpx) in Workers, and total CPU for a full faction sheet at
   300 DPI vs 150-DPI-downsampled — does it need the HTTP-invoked escape hatch, and does even
   that fit comfortably in `cpu_ms`?
4. **Visual quality** at q75–q85 and 150 vs 300 DPI on the faction sheet's filtered texture.
5. **Round-trip integrity** of the pdf-lib re-save: renders in Chrome/Preview/Acrobat, prints,
   and file size actually drops by the predicted factor.
6. If Route 1 fails any of the above: a `basic`-instance Containers prototype with
   `gs -dPDFSETTINGS=/ebook`, measuring wall time and monthly cost at realistic volume.

## Conclusion

Inside Cloudflare there are two serious options, and they are complementary rather than
competing: a small, license-clean, in-Worker recompressor that exploits how narrow Chromium's
output is (pdf-lib walk → native inflate → mozjpeg-WASM → `DCTDecode` swap), and a
Containers-hosted Ghostscript for the day the inputs outgrow that narrowness. The WASM PDF
engines occupy an awkward middle — MuPDF adds AGPL without adding the missing JPEG step, and
Ghostscript-WASM does not realistically fit a Worker at all — and managed APIs solve a problem
this project does not have. Start with Route 1 in the spike; keep Route 3 as the documented
fallback.
