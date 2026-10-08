# Board editor study

This throwaway study supports [Prototype drawing and assigning board territories](https://github.com/ndelangen/dunezone/issues/1965). It lives on `norbert/board-editor-study`. The human layout verdict is pending.

## Run and compare

From this branch, run `bun run storybook -- --port 6018 --no-open`.
On a fresh checkout, install the frozen dependencies and run `bun run generate:images` first.

- [Canvas and inspector](http://localhost:6018/?path=/story/pages-assets-board-editor-study--canvas-and-inspector) keeps properties beside the board.
- [Draw, then assign](http://localhost:6018/?path=/story/pages-assets-board-editor-study--draw-then-assign) gives drawing the main area, then opens territory assignment below it.
- [Territory ledger](http://localhost:6018/?path=/story/pages-assets-board-editor-study--territory-ledger) starts with the territory list and keeps the board and properties alongside it.
- [Arrakis recreation](http://localhost:6018/?path=/story/pages-assets-board-editor-study--arrakis-recreation) compares editable linework with the maintained source map.

The floating switcher changes the layout without replacing the draft. Reloading resets all edits. The study uses Storybook's data seam and needs no Convex deployment.

## What to try

Choose Blank board and draw connected lines. Close a loop or join the rim to make a territory. A cubic curve takes four points and a circular arc takes three. Select a territory, drag its shared boundary points, undo, pan, zoom, and assign its name, type and inset treatment. The interaction fixture includes an enclosed stronghold, an irregular boundary, Polar Sink and an open cut.

Show or hide the 18-sector guide and toggle point snapping. Only placed or moved points snap. The guide and view controls are absent from the downloaded draft and generated SVG. Territory names identify targets but have no visible artwork labels.

The inspector offers sietch, city and ornithopter shortcuts, plus the existing vector catalogue. Add multiple decals, change their position, scale and rotation, then toggle Show decal before cropping. Move the owning boundary and compare the generated SVG.

## Observed results

- A blank-board loop produced two regions.
- Moving a shared boundary updated the neighboring regions and the territory-owned decal crop. Undo restored the previous board.
- The exported clipping proof rendered at 1,948 pixels. Decals changed 22,383 pixels compared with output without decals. Zero changed pixels fell outside the owning territory's crop. The SVG contained zero guide elements and zero visible text elements.
- The interaction fixture produced five regions covering all four territory types. Guide lines produced no additional regions.
- Type checking, scoped lint and formatting, app layout, CSS orphan and variable checks, breakpoint checks and prose checks passed. No formal test suite was added for this throwaway study.

Screenshots, the actual clipping SVG and the pixel report are linked on the ticket.

## Arrakis feasibility remains open

The maintained map contains 42 source territory outlines. The recovered graph has 412 nodes and 463 shared edges. Its current polygonization produces 47 regions, including five slivers smaller than one square board unit. None are silently discarded.

The source recovery merges nearly identical endpoints, with a largest adjustment of 0.002219 board units. The disposable Arrakis graph also uses a 0.01-unit precision grid. Original arcs and cubic controls remain editable and generate SVG curves, but topology uses sampled geometry. Exact intersections and tangencies remain unproved.

The visible comparison differs in generated insets and some symbol sizing. It therefore does not establish exact Arrakis reproduction. One browser computation took 194 ms; this is a single observation, not a latency or frame-rate result.

The rough editor also leaves rim attachment constraints, robust split and merge identity, complete keyboard interaction and pathological geometry for later work. The current rim endpoints can be dragged off the circle. These limits must be resolved before production implementation and Stage 1 verification.

The recommended layout is Draw, then assign, following the map's settled drawing-first contract. This recommendation awaits the human's live judgment and does not resolve the ticket.
