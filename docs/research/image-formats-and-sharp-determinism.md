# Image formats and sharp encoder byte-determinism

Date: 2026-08-06

Research for #252 (part of #250): whether the image pipeline can ship AVIF without a JPEG
fallback, and whether sharp-generated variants are byte-stable enough to commit to the repo
under a SHA-256 renderer identity.

## Recommendation

1. **Serve AVIF first, keep one fallback.** Every evergreen browser and iOS Safari 16+ decodes
   AVIF, but roughly 6–7% of global traffic (dominated by older iOS/macOS Safari) still does
   not. AVIF-only is not yet safe in 2026; AVIF + JPEG via `<picture>` covers effectively
   everything, while AVIF + WebP still strands the pre-Safari-14 tail. JPEG is the fallback
   worth keeping.
2. **Commit the generated variants; do not generate them in CI.** sharp/libvips makes no
   byte-stability promise, demonstrably changes output bytes across versions (including a
   breaking AVIF retune in sharp v0.35.0), and has produced different bytes on macOS vs Linux
   at the same version. Generate variants once on a dev machine with a pinned sharp version,
   commit them, and treat regeneration as an explicit, reviewed event. This is the only
   arrangement under which the publisher's SHA-256 renderer identity stays quiet.

## Format support matrix

### AVIF

Per [caniuse AVIF](https://caniuse.com/avif) and
[MDN's image type guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types):

| Browser | Supported since |
| --- | --- |
| Chrome | 85 (2020) |
| Firefox | 93 (2021); animated AVIF from 113 |
| Edge | 121 (January 2024) |
| Safari (macOS) | 16.4 full (partial 16.1–16.3); requires macOS Ventura+ for full support |
| iOS Safari | 16.x |
| Samsung Internet | 14 |

Global support is about **93.4%** as of mid-2026 ([caniuse AVIF](https://caniuse.com/avif)).
The unsupported tail is concentrated in devices frozen on old Safari: iOS 15 and earlier, and
Safari on macOS Monterey and earlier. Evergreen desktop browsers are all covered (Edge was the
last holdout, closing the gap in 121). MDN also notes AVIF has **no progressive rendering** —
the file must fully download before anything paints — which is an argument for keeping hero
images modest in size, not against the format.

### WebP

Per [caniuse WebP](https://caniuse.com/webp) and MDN: supported by all current browsers;
global support is about **96.1%**. The caveat is again Safari: WebP arrived in Safari 14, and
on macOS it additionally requires Big Sur or later
([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)).

### What this means for fallback choice

The ~3-point gap between WebP (96.1%) and AVIF (93.4%) is mostly Safari 14–16.0-era devices.
Adding WebP as the fallback rescues those, but still abandons the pre-Safari-14 / iOS-13 tail
plus various embedded viewers, link-preview scrapers, and mail clients that only understand
JPEG. Since the pipeline needs to encode a fallback either way, JPEG buys universal coverage
for the same mechanism:

```html
<picture>
  <source srcset="image.avif" type="image/avif" />
  <img src="image.jpg" alt="…" />
</picture>
```

A three-way AVIF/WebP/JPEG stack is defensible but buys little over AVIF/JPEG: any browser
new enough for WebP-but-not-AVIF is a shrinking sliver, and each extra format multiplies the
committed-variant count. **Uncertainty note:** exact percentages are caniuse global-usage
figures as of August 2026 and will drift upward; the qualitative picture (AVIF-only unsafe,
AVIF+JPEG complete) is stable.

### Cloudflare Browser Rendering

Both Cloudflare-supported drivers pin Chromium versions far past the AVIF/WebP thresholds:

- [@cloudflare/puppeteer v1.1.0](https://developers.cloudflare.com/browser-rendering/platform/puppeteer/)
  is based on Puppeteer v22.13.1, which bundles Chrome for Testing **126**
  ([Puppeteer supported browsers](https://pptr.dev/supported-browsers)).
- [@cloudflare/playwright v1.3.0](https://developers.cloudflare.com/browser-rendering/platform/playwright/)
  is based on Playwright v1.58.2, which bundles Chromium **145.0.7632.6**
  ([Playwright release notes](https://playwright.dev/docs/release-notes)).

AVIF needs Chromium 85; WebP predates that. The PDF renderer can therefore consume AVIF or
WebP directly — no separate raster set is needed for print. (Cloudflare's docs do not publish
an independent "our Chromium is version X" statement; the version is implied by the pinned
driver, so re-check on driver upgrades.)

## Is sharp output byte-deterministic?

Short answer: **deterministic enough within one pinned version on one platform; not stable
across versions; not guaranteed across platforms.** Neither sharp nor libvips documents any
byte-stability contract.

### Across versions: definitively unstable

- Each sharp release pins a specific libvips build with pinned codec versions — currently
  libvips 8.18.5 with aom 3.14.1, libheif 1.23.1, libwebp 1.6.0, mozjpeg at a pinned commit
  ([sharp-libvips `versions.properties`](https://github.com/lovell/sharp-libvips/blob/main/versions.properties)).
  Encoder version bumps routinely change the emitted bitstream even at identical settings.
- sharp itself changes encoder behavior between releases. The
  [v0.35.0 changelog](https://sharp.pixelplumbing.com/changelog/v0.35.0/) is explicit:
  "Breaking: Lossy AVIF output is now tuned using SSIMULACRA2-based `iq` quality metrics" —
  every AVIF byte changed at that boundary — alongside a libvips 8.18.3 upgrade.
  [v0.34.0](https://sharp.pixelplumbing.com/changelog/v0.34.0/) similarly changed GIF and HEIF
  output defaults.

Any CI pipeline that regenerates variants with a floating (or even routinely-updated) sharp
version will churn every asset hash on upgrade.

### Across platforms: no guarantee, one documented counterexample

sharp ships per-platform prebuilt binaries compiled from the same pinned sources. In
[sharp #2707](https://github.com/lovell/sharp/issues/2707), the same sharp version produced
different palette-PNG bytes on macOS vs Linux; the maintainer confirmed the quantizer's
"dithering relies on pseudo-random numbers, which may produce different results on different
systems/compilers e.g. clang vs gcc." That case is PNG-specific (libimagequant), but it
establishes the general point: cross-platform byte identity is an accident of implementation,
not a contract.

For the codecs in scope here, the practical picture (uncertainty flagged):

- **JPEG (mozjpeg)**: integer DCT, single-threaded, no timestamps or randomness — in practice
  byte-stable per version across platforms. High confidence, but undocumented.
- **WebP (libwebp)**: integer codec, deterministic per version in practice; no published
  cross-architecture guarantee.
- **AVIF (libheif + aom)**: aom's own test suite asserts identical MD5s across thread counts
  with row multithreading, i.e. thread-count determinism is a tested property
  ([aom commit adding matching-MD5 multithread tests](https://aomedia.googlesource.com/aom/+/0ec03a4c128a53cc1275c376503fea1fe7723f82%5E!/)),
  but nothing warrants x86-vs-ARM or clang-vs-gcc byte identity, and aom versions change
  output freely.

**Conclusion for the repo decision:** committed variants are the only option that makes the
SHA-256 renderer identity meaningful. The commit freezes the exact bytes; sharp version drift
becomes a visible diff instead of silent identity churn. CI can still *verify* (decode and
compare pixels, or check that committed files exist for every source image) without ever
*re-encoding*.

## Prior art: committing variants vs build-time generation

- **eleventy-img** caches processed images to disk, skips files that are unchanged and already
  present, and for remote sources explicitly suggests checking processed output into git to
  avoid refetching ([Eleventy Image docs](https://www.11ty.dev/docs/plugins/image/)). The
  ecosystem norm for static-site image pipelines is "generate at build, cache aggressively" —
  which works because those sites do not hash their outputs into an identity.
- The general argument **against** committing generated files — bloat, merge conflicts, drift
  from source ([Kent C. Dodds](https://kentcdodds.com/blog/why-i-dont-commit-generated-files-to-master)) —
  applies weakly to binary image variants: they never merge-conflict meaningfully (regenerate
  instead), and "drift from source" is precisely what a reviewed regeneration commit makes
  visible.
- The argument **for** committing build outputs — deployment reliability and independence from
  the generating toolchain ([Max F., "It's OK to put compiled front-end assets in git"](https://medium.com/@maxf/its-ok-to-put-compiled-front-end-assets-in-git-9b41abdb803a);
  [Sean C. Davis on images in git](https://www.seancdavis.com/posts/should-i-add-images-to-my-git-repository/)) —
  applies strongly here, with the hash-identity requirement adding a reason those authors did
  not have.
- Repo-size hygiene: binary variants are immutable once committed, so history growth is
  bounded by regeneration frequency. If the variant set grows large, Git LFS is the standard
  escape hatch; not needed at current scale.

## Conclusion

Ship AVIF with a JPEG fallback through `<picture>`; both Cloudflare Browser Rendering drivers
run Chromium ≥126, so the PDF path consumes the same AVIF assets. Generate variants once with
a pinned sharp version, commit the bytes, and let CI verify rather than re-encode: sharp's
cross-version encoder changes are documented and breaking, its cross-platform byte identity is
unguaranteed, and the publisher's SHA-256 renderer identity only stays stable if the bytes
live in the repo.
