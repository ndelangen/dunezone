# Throwaway Rulebook layout spike

Question: which page arrangements preserve useful Dune rulebook content at square, A4 and tall sizes without shrinking the body type?

Three structural variants share content and physical dimensions. The browser entry is isolated beside the print renderer because the subject is printed pages, independent of application chrome and authentication. It is not imported by the application or publisher.

## Files owned by parallel work

- `specimens.mjs`: source-attributed, structured sample content.
- `classic.mjs` and `classic.css`: traditional columns and subordinate imagery.
- `guided.mjs` and `guided.css`: wide section bands and ordered sections.
- `reference.mjs` and `reference.css`: grouped reference entries.
- Root owns `core.mjs`, `base.css`, the review entry, local runner and capture script.

## Shared shape

`specimens.mjs` exports `specimens`, an array of `{ id, title, subtitle, source, emblem?, sections }`.
Each section has `{ id, title, kind, columns?, items }`.
Kinds are `rules`, `entries`, `table`, `qa`.
Each item has `{ id, title, paragraphs: string[], asset?, cells?: string[], note? }`.
Assets are existing repository URLs such as `/media/vector/logo/fremen.svg`.
All fixture copy is attributed to the supplied PDFs and explicitly marked as a layout specimen.

Each variant exports `renderClassic(host, specimen, format)`, `renderGuided(...)` or `renderReference(...)`.
The function creates physical pages inside the attached host and returns `{ pages, placements }`.
`pages` is an array of page elements; `placements` is an array of `{ id, page, region }` in source reading order.
Format is `{ id, width, height, inner, outer }`, measured in millimeters.

Shared `core.mjs` exports:

- `makePage(host, specimen, format, variant, index)` returns `{ page, body }`. Header and footer are outside body. Page dimensions are fixed; body grows to its remaining height. Body type is 10.5 pt.
- `element(tag, className, text?)` creates a DOM element, assigning plain text safely.
- `renderItem(item, section, mode = 'normal')` returns a `.content-unit` with `data-content-id`. It includes the item title, paragraphs, optional asset and table cells. Modes `normal`, `compact`, `record` are available.
- `sectionHeading(section, continued = false)` creates the group heading.
- `fits(region)` compares the last child's bottom with the region's bottom. Regions must have a fixed usable height and `min-height: 0`.
- `placeFlow(items, createRegions, render)` appends indivisible items in order across fixed regions. `createRegions(pageIndex)` must append a page and return that page's ordered region elements. `render(item, continued)` returns a DOM node. It returns placements and records oversize items instead of discarding content. A page header may repeat context without repeating item identity.

Shared flow is measurement only. Each variant owns its page geometry, hierarchy, type emphasis, section context and placement decisions. Never use CSS multicolumn flow because it hides page continuation and content placement.

No app, Convex, Mantine, or external network imports inside these print renderers. No persistence. No tests to maintain for throwaway code. Browser measurements and actual PDF rendering answer the question.
