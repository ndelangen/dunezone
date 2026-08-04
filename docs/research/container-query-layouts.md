# Container queries for reusable layouts

Date: 2026-08-04

## Recommendation

Adopt **inline-size container queries** for `TriptychLayout`,
`AsymmetricSplitLayout`, and `AtlasLayout`.

This is both feasible and a better match for these components than viewport-width media
queries: their presentation should respond to the inline space allocated by their parent, so
the same layout can be placed on a page, in a sidebar, or inside another layout without knowing
the viewport. The CSS specification describes container queries as testing elements within the
document rather than the user-agent or device environment, and explicitly demonstrates the same
component responding independently in main and sidebar containers
([CSS Conditional Rules Level 5, sections 5 and example](https://drafts.csswg.org/css-conditional-5/#container-queries)).

Do **not** interpret this as a ban on all media queries. Media queries remain the correct tool for
viewport/device/user-environment concerns such as print, `prefers-reduced-motion`, pointer
capability, or an application shell whose behavior truly follows the viewport. The recommended
rule is narrower: reusable component geometry should use its allocated container size.

## Feasibility in this repository

### Browser and build support

Native size container queries shipped in the three browser engines before the repository's
current production targets: Chromium 105
([Chrome 105 release notes](https://developer.chrome.com/blog/new-in-chrome-105)), Firefox 110
([Firefox 110 developer release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/110)),
and WebKit in Safari 16
([WebKit's Safari 16 release notes](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)).

This repository uses Vite 8.1 ([`package.json`](../../package.json)) and does not override
`build.target` or `build.cssTarget` in [`vite.config.ts`](../../vite.config.ts). Vite 8's default production target is
`baseline-widely-available`, specifically Chrome 111, Edge 111, Firefox 114, Safari 16.4, and iOS
16.4 as of its 2026-01-01 target snapshot
([Vite build target documentation](https://main.vite.dev/config/build-options#build-target)). Each
target uses an engine version newer than the corresponding native-support release above. No
polyfill or PostCSS transform is needed. Vite already treats `.module.css` files as CSS Modules and recommends native,
standards-compliant CSS for modern-browser projects
([Vite CSS and CSS Modules documentation](https://main.vite.dev/guide/features#css-modules)).

There is also local precedent. `ConnectedTabs` declares named inline-size containers and queries
an inner layout, while `FactionSheetReview` uses a two-axis `size` container because it genuinely
queries both width and height:

- [`ConnectedTabs.module.css`](../../src/app/components/content/ConnectedTabs/ConnectedTabs.module.css)
- [`FactionSheetReview.module.css`](../../src/app/components/factions/editor/FactionSheetReview.module.css)

The three new layout components only need inline width, so `inline-size` is the safer, less
restrictive type.

### Implemented approach

All three layouts now establish a named `inline-size` container and switch their descendant grids
with container queries:

- [`TriptychLayout.module.css`](../../src/app/components/layout/TriptychLayout.module.css)
- [`AsymmetricSplitLayout.module.css`](../../src/app/components/layout/AsymmetricSplitLayout.module.css)
- [`AtlasLayout.module.css`](../../src/app/components/layout/AtlasLayout.module.css)

`AsymmetricSplitLayout` and `AtlasLayout` also size their fluid gaps with `cqi`. Their column and
spacing decisions therefore follow the space each layout actually receives, including when one is
nested in a narrow parent inside a wide viewport.

## Required structure

For each component, use a container host and a descendant grid:

```css
.host {
  container: triptych-layout / inline-size;
  min-width: 0;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
}

@container triptych-layout (min-width: 61.25rem) {
  .grid {
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.72fr) minmax(0, 0.9fr);
  }
}
```

The extra descendant is necessary. Container selection is performed among an element's
**ancestor** query containers, so an element cannot change its own grid definition based on its
own query size
([CSS Conditional Rules Level 5, query-container selection](https://drafts.csswg.org/css-conditional-5/#container-rule)).
The existing `ConnectedTabs` host/inner-root pattern is the correct model.

Prefer a unique container name per component. Names filter which ancestor containers are
eligible, and the nearest matching ancestor naturally makes instances work when different layout
components—or even the same layout component—are nested
([CSS Conditional Rules Level 5, `container-name`](https://drafts.csswg.org/css-conditional-5/#container-name)).

Use **mobile-first defaults** (one column and non-sticky) and add the richer layout at a
`min-width` container threshold. This makes the unsupported-browser fallback readable without a
media-query duplicate: unsupported browsers ignore both `container-type` and `@container`, leaving
the stacked base layout. Given the repository's Vite target, that is a graceful fallback for
out-of-contract legacy browsers rather than a supported rendering path.

## Migration shape

### `TriptychLayout`

1. Make the public/root element the named `inline-size` query host.
2. Add one inner element that owns the grid and the three slot wrappers.
3. Default the inner grid to one column.
4. At approximately `61.25rem` of **container** inline size, restore the existing three tracks.
5. Keep `min-width: 0` on slot wrappers. Keep center alignment inside the layout because it is
   part of this composition's geometry.

### `AsymmetricSplitLayout`

1. Use a named `inline-size` host plus an inner grid.
2. Default to one column.
3. At approximately `61.25rem`, apply the existing `1.15fr 0.85fr` tracks.
4. Replace `clamp(2rem, 5vw, 5rem)` with `clamp(2rem, 5cqi, 5rem)` so the gap follows the same
   allocated space as the columns. Container-relative units are defined as percentages of the
   selected query container (`1cqi` is 1% of its inline size)
   ([CSS Conditional Rules Level 5, container-relative lengths](https://drafts.csswg.org/css-conditional-5/#container-lengths)).

### `AtlasLayout`

1. Use a named `inline-size` host plus an inner grid.
2. Default to one column and `position: static` for the sidebar.
3. At approximately `56.25rem`, apply the existing sidebar/content tracks and sticky sidebar.
4. Replace `clamp(2rem, 6vw, 6rem)` with `clamp(2rem, 6cqi, 6rem)`.
5. Continue accepting the page-owned sticky offset class. Querying allocated width belongs to the
   layout; choosing the offset below a particular page header remains a page concern.

Use `rem` for the thresholds rather than carrying the current `em` spellings over mechanically.
Relative units in a container condition are resolved against the query container's computed
values, so an `em` threshold can change when a container inherits a different font size
([CSS Conditional Rules Level 5, relative values in size conditions](https://drafts.csswg.org/css-conditional-5/#size-container)).
`rem` preserves a stable geometric threshold while still respecting the user's root font size.

## Important constraints and caveats

### Choose `inline-size`, not `size`

`container-type: inline-size` applies style containment and inline-axis size containment, while
allowing content to determine block size. `size` contains both axes and would make an auto-height
layout size as if empty unless its height were supplied externally
([CSS Conditional Rules Level 5, `container-type`](https://drafts.csswg.org/css-conditional-5/#container-type),
[CSS Containment Level 2, inline-size containment](https://drafts.csswg.org/css-contain-2/#inline-size-containment)).
These layouts query width only, so full `size` containment would add risk without benefit.

### Intrinsic sizing changes

Inline-size containment means the host's inline-axis intrinsic sizes are calculated as if it had
no content. This can affect `min-content`, `max-content`, `fit-content`, shrink-to-fit sizing, and
grid/flex track contribution
([CSS Containment Level 2, size and inline-size containment](https://drafts.csswg.org/css-contain-2/#size-containment)).
It is safe when the parent allocates an inline size—as normal block layout and the current page
grids do—but a host placed in an intrinsically sized or shrink-to-fit context can collapse or
become narrower than its contents suggest. Keep `min-width: 0`, require the parent to allocate the
available width, and add nested/narrow-host stories to make that contract visible.

### Style containment is observable

Both `inline-size` and `size` query containers apply style containment. Style containment scopes
CSS counters and quote-depth changes to the container subtree
([CSS Containment Level 2, style containment](https://drafts.csswg.org/css-contain-2/#style-containment)).
The current slots do not rely on counters spanning across the layout boundary, but a future
document-like composition might. This should be documented as part of the layout host contract.

### Use an ordinary box as the host

Containment has no effect on elements without a principal box (`display: none` or
`display: contents`), and size-query evaluation is unknown when there is no suitable containment
box
([CSS Containment Level 2, containment applicability](https://drafts.csswg.org/css-contain-2/#inline-size-containment),
[CSS Conditional Rules Level 5, size-query evaluation](https://drafts.csswg.org/css-conditional-5/#size-container)).
Keep the host as the current ordinary `div`; do not try to erase the wrapper with
`display: contents`.

Full size containment also suppresses the natural dimensions and natural aspect ratio of replaced
elements such as images when sizing the containment box
([CSS Containment Level 2, replaced elements](https://drafts.csswg.org/css-contain-2/#size-containment)).
That does not affect images *inside* these `div` hosts, and is another reason not to put the query
container directly on an image/canvas or use full `size` containment here.

### Feedback cycles and scrollbars

Containment is the mechanism that prevents a descendant's queried style from changing its
container's queried size in an infinite loop. Inline-size containment still permits indirect
dependencies through block size—for example, content can cause ancestor scrollbars that alter
available inline size—and the specification resolves these without reverting to a previously
problematic layout
([CSS Containment Level 2, inline-size feedback and scrollbars](https://drafts.csswg.org/css-contain-2/#inline-size-containment)).

Practical safeguards for these layouts are straightforward:

- keep slot wrappers at `min-width: 0`;
- do not add overflow/scroll behavior to the generic query host;
- avoid thresholds that are exactly on a known persistent-scrollbar boundary when a small
  adjustment gives the same design result;
- test long unbreakable content and both overlay and persistent scrollbar environments.

### Container-query units need an eligible container

When no eligible query container exists, `cqi`/`cqw` fall back to small viewport units, which can
silently reintroduce viewport-relative behavior. Use `cqi` only on descendants of the component's
named host, ideally inside that component's `@container` rule
([CSS Conditional Rules Level 5, container-relative lengths and fallback](https://drafts.csswg.org/css-conditional-5/#container-lengths)).

## Verification plan for implementation

1. Add Storybook stories that place each layout in fixed-width hosts both above and below its
   threshold while keeping the viewport unchanged.
2. Add one composition story nesting `TriptychLayout` or `AsymmetricSplitLayout` inside the main
   region of `AtlasLayout`; resize the outer host and verify each instance follows its own nearest
   named container.
3. Verify each layout at its exact threshold and one CSS pixel on either side.
4. Test long unbroken slot content, images with intrinsic aspect ratios, and the Atlas sticky
   sidebar in a page with the real header offset.
5. Keep media queries for environment-level concerns (`print`, reduced motion, and true
   viewport-owned shell behavior); migrate only component-width decisions.

## Conclusion

The three components now make their actual dependency—allocated inline size—explicit. Their named
`inline-size` hosts, descendant grids, mobile-first base styles, and container-relative gaps improve
nesting while fitting the project's existing CSS architecture and supported browser floor.
