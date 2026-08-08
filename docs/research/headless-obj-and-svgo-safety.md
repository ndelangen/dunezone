# Headless SVG→OBJ generation and safe SVGO profiles for contract SVGs

Date: 2026-08-08

Research for #295 (part of #294): whether the three.js `SVGLoader` → `ExtrudeGeometry` →
`OBJExporter` pipeline can run headlessly in Bun CI and how byte-stable its output is, and which
SVGO 4 `preset-default` plugins violate the vector contract invariants — paint inheritance,
fragment-id API, root `overflow="visible"`, and normalization wrapper transforms.

Claims below are grounded in three.js and SVGO source plus an executed spike against this repo's
real vectors (using the authoring tool's installed `three@0.185.0`, `svgo@4.0.1`, `jsdom`, and
`linkedom`); spike results are labeled as such.

## Recommendation

1. **OBJ stack: three.js `SVGLoader` + `ExtrudeGeometry` + `OBJExporter` under Bun, with jsdom's
   `DOMParser` injected as a global.** `SVGLoader.parse` needs exactly one browser global —
   `DOMParser` — and no layout APIs whatsoever; the exporter and geometry stages are DOM-free.
   Spike-verified: the tool's `svgToObj.ts` runs unmodified under Bun 1.3 and Node 22 with both
   jsdom and linkedom shims, producing **byte-identical OBJ output across all four
   combinations** on real decals. This reproduces the tool's output shape exactly, which no
   alternative library does.
2. **Treat OBJ bytes as deterministic per pinned {three version, platform}; verify macOS↔Linux
   identity in a spike before relying on it.** Number-to-string formatting and triangulation are
   spec-deterministic; only transcendental `Math` functions are implementation-approximated, and
   the pipeline's 4-decimal precision trim absorbs last-ulp noise (hence the observed V8/JSC
   byte-identity). Cross-OS identity is very likely but unproven. Either way the stakes are low:
   **OBJ artifacts live outside the ingredient-hashed renderer identity** — the publisher
   manifest digest covers publisher assets (excluding `public/`) plus the runtime closure
   ([`workers/publisher/renderer-manifest-build.ts`](../../workers/publisher/renderer-manifest-build.ts)),
   and the planned vector move is to ingredient hashing over SVG *sources*. OBJ nondeterminism
   would be git churn, not capture-identity churn. Follow the sharp precedent
   ([image-formats-and-sharp-determinism](image-formats-and-sharp-determinism.md)): pin the
   exact three version, commit the outputs, let CI regenerate-and-diff — which doubles as the
   cross-platform determinism proof.
3. **SVGO baseline: `preset-default` with `convertTransform: { matrixToTransform: false }`, plus
   two per-category override sets.** Paint-inheritance categories additionally disable
   `removeUselessStrokeAndFill` (the only preset plugin that can *add* `fill`/`stroke`
   attributes). Fragment-id files additionally disable `cleanupIds`, `collapseGroups`,
   `mergePaths`, and `removeEmptyContainers`. `overflow="visible"` needs **no** override — SVGO
   4 has no default listed for `overflow`, so `removeUnknownsAndDefaults` never touches it
   (spike-verified). `removeViewBox` left `preset-default` in v4, so the viewBox is safe by
   default — and the tool's current `removeViewBox: false` override now only triggers a config
   warning (tool-side cleanup, separate repo).

## Question 1: headless OBJ generation

### What SVGLoader actually needs from a DOM

From current three.js source
([SVGLoader.js](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/SVGLoader.js)),
`parse(text)` starts with `new DOMParser().parseFromString(text, 'image/svg+xml')` taken from the
**global scope** — SVGLoader never references `window`, `self`, or `document`. On the parsed tree
it uses only: `getAttribute`/`getAttributeNS`/`hasAttribute`, `nodeName`, `childNodes`,
`querySelectorAll` (gradient resolution), `node.style` indexed by hyphenated property names
(presentation-style overrides), `sheet.cssRules` (only when `<style>` elements exist), and
`viewportElement.getElementById` (only when `<use>` elements exist). There are **zero layout
calls** — no `getBBox`, `getComputedStyle`, or bounding rects; unit handling is a fixed string
table. This matches the map's verified fact that only authoring-time crop needs `getBBox`.

The contract sources are fills-only paths with no `<style>`, `<use>`, or gradients, so the three
risky DOM surfaces (CSSOM sheets, `<use>` id resolution, `style` hyphenated indexing) are not
exercised at all. `ExtrudeGeometry`, `BufferGeometryUtils.mergeVertices`, and `OBJExporter`
import only math/color classes and touch no browser API
([OBJExporter.js](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/exporters/OBJExporter.js)).

### Shim choice

- **jsdom** — recommended. Full `DOMParser` with `image/svg+xml`, CSSOM, and `element.style`;
  its explicit no-layout stance is irrelevant here. Already a devDependency of the authoring
  tool, so both ends of the shared-rules contract use one shim.
- **linkedom** — worked byte-identically in the spike, but its README positions it as a minimal
  SSR DOM ("prefer jsdom for browser simulation") and its `CSSStyleDeclaration`/SVG fidelity is
  undocumented. Fine fallback, not the pick.
- **happy-dom** — Bun's recommended test DOM, but it had a documented
  `DOMParser(..., 'image/svg+xml')` bug returning a null document
  ([happy-dom #1078](https://github.com/capricorn86/happy-dom/issues/1078)); whether current
  releases fixed it is unverified. Not needed given jsdom works under Bun.

Spike detail: the only patching required was `globalThis.DOMParser` (plus `globalThis.Document`
for the tool's `instanceof Document` check in `readSvgHeight`) — about five lines of bootstrap.

### Determinism assessment

Byte-stability decomposes cleanly:

- **Float formatting**: `OBJExporter` stringifies via implicit `Number::toString`, which modern
  ECMA-262 fully specifies (shortest round-trip digits, ties-to-even)
  ([ECMA-262 §6.1.6.1.20](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html));
  identical doubles print identically in V8 and JSC.
- **Basic arithmetic** (`+ − × ÷ sqrt`) is correctly rounded per IEEE-754 — bit-deterministic
  everywhere. Bezier evaluation and earcut triangulation (`ShapeUtils.triangulateShape` uses
  three's vendored Earcut) are pure arithmetic with deterministic iteration order.
- **Transcendentals** (`Math.sin/cos/atan2`…) are implementation-approximated per spec. V8
  ships fdlibm; JavaScriptCore (Bun) uses the system libm, so last-ulp differences across
  engines *and* across OSes are possible in principle
  ([engine libm survey](https://zenn.dev/mod_poppo/articles/libm-precision?locale=en)). Exposure
  in this pipeline is narrow: `bevelEnabled: false` skips the bevel trig, and trig then enters
  only via arc/ellipse sampling — **29 of 512 contract SVGs contain arc path commands; none
  contain `<circle>`/`<ellipse>` elements** (counted in this repo).
- **The 4-decimal precision trim is the determinism workhorse**: `toFixed(4)` collapses last-ulp
  disagreements unless a value sits exactly on a rounding boundary. Spike-verified: Bun/JSC and
  Node/V8 produced byte-identical OBJ files on the same machine (identical SHA-256 across
  jsdom×linkedom×Bun×Node, repeat-stable).

**Uncertainty note:** cross-OS byte-identity (macOS ARM dev machine vs Linux x64 CI) is the one
untested axis, and the 29 arc-bearing files are where it would surface. Also unpinned: three.js
gives no cross-version stability promise — `ExtrudeGeometry`/`SVGLoader` tessellation changes
between releases will rewrite every committed OBJ, exactly like sharp's encoder retunes. Pin
`three` exactly (the tool has `0.185.0`, this repo `^0.185.1` — align on one exact version) and
treat upgrades as reviewed regeneration events.

**Identity scope:** the renderer identity digest hashes publisher static assets — explicitly
excluding `public/` — plus the runtime-closure sources and the capture contract
([`renderer-manifest-build.ts`](../../workers/publisher/renderer-manifest-build.ts)). OBJ
artifacts are TTS-bound outputs (TTS publishing infrastructure is out of scope on #294) and feed
no capture; they sit entirely outside that identity. The move of vectors to ingredient hashing
hashes SVG *sources*, so even committed OBJs would remain identity-neutral.

### Alternatives (brief)

- **svg-mesh-3d**: takes a single path `d` string (no document parsing, no transforms), outputs
  a flat cdt2d triangulation — no extrusion, effectively unmaintained. Not viable.
- **manifold-3d**: actively maintained WASM solid-modeling kernel; `CrossSection.extrude` would
  give guaranteed-manifold solids but accepts polygon contours, not SVG — SVGLoader would still
  be needed upstream, and WASM float determinism is its own open question. Overkill unless TTS
  ever complains about non-manifold meshes.
- **tess2** and similar triangulators: no SVG input, no extrusion, dormant. Not viable.

Only the three.js stack reproduces the tool's exact output shape (fills-only, viewBox-height
Y-flip, weld, precision trim), which the repo generator is required to match.

## Question 2: SVGO 4 safety per contract invariant

SVGO 4's `preset-default` runs 34 plugins
([preset-default.js](https://github.com/svg/svgo/blob/main/plugins/preset-default.js));
`prefixIds` is not among them, and `removeViewBox` was **removed from the preset in v4**
([v4.0.0 release](https://github.com/svg/svgo/releases/tag/v4.0.0)) — two prior hazards gone by
default. The findings below are from plugin source plus a spike running `svgo@4.0.1` on fixtures
modeling each invariant.

### (a) Paint inheritance — files that must carry no fill

- `removeUnknownsAndDefaults` only *removes* attributes equal to `_collections.js` defaults
  (`fill: '#000'` etc.), skips elements carrying an `id`, and never adds anything. On files with
  no paint attributes it is a paint no-op. `fill="none"` is not a default value and survives
  (spike-verified; the contrary report
  [svgo #1641](https://github.com/svg/svgo/issues/1641) was closed as unreproducible).
- **`removeUselessStrokeAndFill` is the only preset plugin that can add paint attributes**: its
  fill branch adds `fill="none"` when computed fill-opacity is 0, and its stroke branch adds
  `stroke="none"` when an ancestor sets a stroke it needs to block
  ([source](https://github.com/svg/svgo/blob/main/plugins/removeUselessStrokeAndFill.js)). For
  fill-free, stroke-free files neither branch can fire, and it skips id-carrying elements and
  whole documents containing `<style>`/scripts — but since "no paint attributes may appear" is a
  hard generator guarantee, disable it for paint-inheritance categories rather than rely on
  those preconditions. Leave its `removeNone` param off everywhere.
- `convertColors`, `mergeStyles`/`inlineStyles`/`minifyStyles` rewrite existing values/styles
  only; with no fills and no `<style>` elements they are no-ops. `moveElemsAttrsToGroup` can
  hoist a shared child `fill` to the group — inheritance-equivalent, and impossible with no
  fills present.

Spike result: `preset-default` on a fill-free fixture with nested wrappers emitted **no `fill`
attribute anywhere**.

### (b) Fragment-id API files (`#root`, `#sectors`, per-territory ids)

**This is the single biggest hazard.** `cleanupIds` defaults (`remove: true, minify: true`)
judge "referenced" by in-file `url()`/`href` usage only; ids referenced solely by external
consumers look unused and are deleted. Spike result: the background-style fixture collapsed
under plain `preset-default` to a single `<path>` with **every id gone** (`mergePaths` then
merged the de-identified territory paths). Required overrides, all verified in source:

- `cleanupIds: false` — non-negotiable (safer than `remove:false, minify:false`, and
  `preservePrefixes` invites silent misses).
- `collapseGroups: false` — it never renames ids but will dissolve a group and move its
  attributes **including `id`** onto a single id-less child
  ([source](https://github.com/svg/svgo/blob/main/plugins/collapseGroups.js) checks the child's
  id, not the group's); `#sectors` would survive as a value but migrate to a different element.
- `mergePaths: false` — merges adjacent paths whose attributes are exactly equal; id-less
  sibling paths inside an API file would fuse. (Territory paths with distinct ids are already
  unmergeable, but the blanket disable keeps structure verbatim.)
- `removeEmptyContainers: false` — deletes empty `<g id="…">` anchors; only masks are exempted.

`moveGroupAttrsToElems` requires id-less children and so is blocked by territory ids;
`removeUnknownsAndDefaults` skips id-carrying elements entirely. With the four overrides above,
the spike preserved `#root`, `#sectors`, and both territory ids verbatim on their original
elements.

### (c) Root `overflow="visible"`

Survives `preset-default` untouched (spike-verified). Root cause in source: `_collections.js`
lists `overflow` as a known presentation attribute but assigns it **no default value**, and
`removeUnknownsAndDefaults` only strips attributes equal to a listed default
([source](https://github.com/svg/svgo/blob/main/plugins/_collections.js)). SVGO thereby
sidesteps the UA-stylesheet subtlety (CSS initial `overflow` is `visible`, but the UA sheet sets
`overflow: hidden` on nested svg roots — the very mechanism behind the halo clipping). No
override needed; keep a structural-verifier assertion anyway since this is load-bearing and only
guaranteed by an *absence* in SVGO's data tables. **Uncertainty note:** verified on `svgo@4.0.1`
and current main; older releases not audited.

### (d) Normalization wrapper transforms

- `collapseGroups` merges transforms by parent-first string concatenation — mathematically the
  correct composition order, lossless at that stage. Spike:
  `translate(10 20) scale(.5)` wrapping `matrix(1 0 0 1 -3 -4)` collapsed to
  `matrix(.5 0 0 .5 8.5 18)` — exact.
- `convertTransform` is where loss lives: it multiplies chains into one matrix, rounds at
  `transformPrecision: 5`/`floatPrecision: 3`, and its `matrixToTransform` decomposition has a
  **still-open correctness bug** — near-identity matrices with small shear are simplified to a
  bare `translate`, silently dropping the shear
  ([svgo #1222](https://github.com/svg/svgo/issues/1222)). Normalization wrappers are pure
  scale+translate (no shear), so the bug's exact shape should not arise — but hand-tuned or
  auto-traced inputs are not audited for that, and the guard is cheap: set
  `convertTransform: { matrixToTransform: false }` in the shared baseline. Matrices then keep
  their form and only round. **Uncertainty note:** #1222 was not re-reproduced against 4.x in
  this research; the override makes the question moot.

### Baseline config and per-category overrides

```js
/** Shared baseline — safe for every category. */
const baseline = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          // svgo #1222: matrix→transform decomposition can drop near-identity shear.
          convertTransform: { matrixToTransform: false },
        },
      },
    },
  ],
};

/** Per-category additions to the same overrides object. */
const paintInheritance = {
  // logo, troop, troop_modifier, generic: hard guarantee that no paint attribute
  // can ever be introduced (the only preset plugin able to add fill/stroke).
  removeUselessStrokeAndFill: false,
};

const fragmentIdApi = {
  // background: ids are public API and structure must stay verbatim.
  cleanupIds: false,
  collapseGroups: false,
  mergePaths: false,
  removeEmptyContainers: false,
};

// decal (incl. -multicolor) and icon: baseline as-is. convertColors only
// rewrites existing values and cannot change paint presence.
```

`floatPrecision` is left at the default 3 here; with viewBoxes up to ~11,800 units the
appropriate value is a rules-table decision per category, not a safety issue (path data rounding
via `cleanupNumericValues`/`convertPathData` is visually lossy only, never structurally). Note
v4's `convertColors` lowercases colors by default — a diff-noise, not correctness, concern for
the multicolor decals.

## What a local spike must verify

1. **Cross-OS OBJ byte-identity**: regenerate the full corpus on macOS and in Linux CI and diff
   hashes — the 29 arc-command files are the sentinels. This falls out for free if CI's check is
   "regenerate and `git diff --exit-code`".
2. **Full-corpus headless run under Bun + jsdom**: the spike covered two decals; the background
   map (largest viewBox, heaviest path data) and the 1.7 MB auto-traced decals need a
   memory/time check.
3. **SVGO idempotence**: optimizing already-optimized output must be a fixed point, or committed
   minified files will churn on every regeneration.
4. **Structural verifier assertions** (generator tail): no `fill`/`stroke` attributes anywhere
   in paint-inheritance categories; id set and id-element pairing verbatim in background files;
   `overflow="visible"` present on every generated root; viewBox unchanged.
5. **Exact-pin alignment**: one exact `three` version shared by tool and repo (currently
   `0.185.0` vs `^0.185.1`); regeneration on version bump is a reviewed event.
6. **Tool-side config cleanup** (separate repo): `svgo@4` warns that `removeViewBox` is not part
   of `preset-default` — the tool's override in `svgoLoader.ts` is dead config; drop it when
   aligning tool presets with the shared rules source.
7. **`<use>`/gradient absence in sources**: SVGLoader's `<use>` path needs
   `viewportElement.getElementById`, unverified in jsdom — cheapest fix is a generator guard
   forbidding `<use>`/gradients/`<style>` in `media/vector/` sources.

## Conclusion

The tool's exact OBJ pipeline runs headlessly today — Bun plus a five-line jsdom `DOMParser`
bootstrap reproduced it byte-for-byte across two engines and two DOM shims — and its output sits
outside the ingredient-hashed renderer identity, so the remaining cross-OS determinism question
is a git-churn risk that a commit-then-CI-diff arrangement resolves and continuously re-proves.
On the SVGO side, v4's preset-default is safe for paint inheritance and `overflow="visible"` as
authored, hazardous by default only for externally-referenced fragment ids and (via one open
decomposition bug) transform fidelity; a shared baseline with `matrixToTransform: false` plus
one override each for paint-inheritance and fragment-id categories, backed by structural
verifier assertions, keeps every contract invariant intact.
