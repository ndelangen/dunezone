# Board editor study

This throwaway study supports [Prototype drawing and assigning board territories](https://github.com/ndelangen/dunezone/issues/1965). It lives on `norbert/board-editor-study`. The user chose A, the canvas and inspector layout, on 8 October 2026. The current screen develops that choice and removes the variation switcher and prototype debugging UI.

## Run

From this branch, run `bun run storybook -- --port 6018 --no-open`.
On a fresh checkout, install the frozen dependencies and run `bun run generate:images` first.

- [Canvas and inspector](http://localhost:6018/?path=/story/pages-assets-board-editor-study--canvas-and-inspector) opens the interaction fixture.
- [Arrakis recreation](http://localhost:6018/?path=/story/pages-assets-board-editor-study--arrakis-recreation) opens the recovered source map.
- [Blank board](http://localhost:6018/?path=/story/pages-assets-board-editor-study--blank-board) starts with the circular rim.

Reloading resets all edits. The study uses Storybook's data seam and needs no Convex deployment.

## Confirmed direction

The editor fills the page width, using the same DocumentEditorLayout as the rulebook editor. A compact left pane gives the map more room. The left pane has one tab per territory and holds the selected territory's properties in the same surface. Each tab shows its territory silhouette in its actual position inside an outline of the board circle, including any holes. Territory names identify targets and do not appear on exported artwork.

PageToolbar holds navigation, undo, redo, artwork preview and the two downloads. Drawing, point editing, guide, snapping, cropping preview and zoom controls sit beside the map. Position, scale and rotation use sliders. Inset treatment uses a Select. SegmentedControl is banned by the user's instruction, recorded in AGENTS.md.

Decals use existing catalogue vectors, including city, sietch and ornithopter. Each decal has a white-outline setting, enabled by default. The outline belongs to the decal and is included in the SVG. Extracted reference-symbol vectors are removed.

Show decal before cropping is a map view setting. It reveals a translucent copy of the selected territory's uncropped decals. It is absent from both the board draft and exported artwork, along with guide, snapping, selection and zoom state.

## What to try

Draw connected lines, close a loop or join the rim to make a territory. A cubic curve takes four points and a circular arc takes three. Select a territory, drag its shared boundary points, undo, pan, zoom, and assign its name, type and inset treatment.

Add boundary point inserts a point on an existing edge while preserving its curve. Remove boundary point removes a point and reconnects its two neighbors. Removing a curve point simplifies that join to a straight line; removing an inserted rim point preserves the circular arc. Junctions with more than two edges require removing an edge first. The original four rim anchors cannot be removed. Undo restores these edits.

Remove connection deletes the edge between two points and keeps both points visible and editable, including points left with no connections. The circular rim stays connected. Undo restores a removed edge.

Every line endpoint is selectable, including open cuts that do not form a territory. Interior points and curve controls stay inside the circular board. Rim points slide along the circle between their neighbors; the rim's center, radius and full circumference stay fixed. The same constraints apply to dragging, coordinate sliders, keyboard moves and point placement. The Arrakis preset keeps the maintained map's elliptical outer arcs and their reference endpoints fixed.

Snapping uses a 20-screen-pixel magnetic range, adjusted for canvas size and zoom. Existing points take priority, followed by shared edges and the sector or circular guide. The actual visible guide segments supply snapping coordinates, including the intersections with the circular rim. Dragged points exclude themselves and their incident edges from attraction. With snapping off, only an exact join within half a board unit connects points.

## Observed results

- A blank-board loop produced two regions. The interaction fixture produced five regions covering all four territory types. Guide lines produced no additional regions.
- Native browser interactions verified point insertion and removal, connection removal with both endpoints kept, undo, territory tab selection, slider changes, the white-outline switch and snapping onto a visible sector line.
- A sampled cubic split preserved the original curve to a maximum measured difference of 2.05e-13 board units and kept the fixture's five regions.
- The actual SVG clipping proof rendered at 1,948 pixels. Decals changed 22,089 pixels compared with the same output without decals. Zero changed pixels fell outside the owning territory's crop. Switching one white outline changed 3,210 pixels. The SVG contained zero guide elements and zero visible text elements.
- The sector-alignment check initially measured a 27.6-unit displacement. The snapping grid was rotated 10 degrees from the visible guide. Snapping now uses the guide's actual transformed line segments. The repeated check measured a maximum distance of 2.91e-14 units from all 18 visible lines. Three regression tests cover points on the guide, attraction from an offset, snapping off and guide intersections with the circular rim.
- Native dragging moved an open-cut endpoint against the rim and slid a rim point along it. Four circle regression tests cover interior limits, rim movement and ordering, insertion and snapping-off placement. They sample the entire rim and verify that it still covers exactly one full circle.
- Type checking, scoped lint and formatting, app layout, CSS orphan and variable checks, breakpoint checks and prose checks passed. The existing PageLayout suites passed seven tests.

Screenshots, the actual clipping SVGs and the pixel report are linked on the ticket.

## Arrakis preset

The user confirmed on 8 October 2026 that Arrakis conversion is a one-time operation. Quick-load should give authors the board made now, rather than repeat the conversion. Load board offers Arrakis and a blank board beside the map tools. Loading either can be undone.

The saved Arrakis preset contains 412 points, 452 shared edges and 42 territories. Loading it clones the complete board, including names, types, inset contours, paint order and five decals. The conversion tool does not run in the editor.

The extra territories came from neighboring source outlines dividing the same straight border at different vertices. Twelve intermediate points lay on long neighboring edges without being connected to them. Their largest perpendicular discrepancy was 0.000495 board units. Connecting those junctions and sharing the resulting segments removes the narrow regions. No area filter discards territories.

A controlled comparison produced 47 regions with the original graph and its precision grid, and 60 without the grid. The connected graph produces 42 both with and without the grid. The editor no longer needs the fixture-specific grid.

Every generated territory has exactly the complete edge set of its source territory. Habbanya Ridge Flat retains its enclosed hole. Independent masks from the maintained SVG found zero fully filled interior mismatches for all 42 territories at 1,948 and 3,896 pixels. Fractional boundary coverage differs slightly because nearly identical source endpoints were joined. The largest endpoint adjustment remains 0.002219 board units.

The preset stores the original inset contours as editable points anchored to shared borders. Moving a boundary moves its associated contours; inserting a boundary point preserves the contour. Removing its supporting geometry falls back to the generated inset. Changing territory type applies the new type's default treatment. Source stroke treatment and paint order preserve the original appearance.

Arrakis city and sietch are two reusable catalogue vectors, shared by the five placements. They retain the source outline, which can be turned off per decal. There are no per-placement reference-symbol vectors.

Four Arrakis regression tests cover complete territory correspondence and holes, moving shared geometry, inserting a point without altering the inset, and a board JSON round trip. The existing seven circle and sector tests also pass. Native browser checks verified quick-load, moving a shared junction, keeping 42 tabs and restoring geometry with undo.

Run the saved SVG comparison with:

```bash
bun scripts/board-arrakis-proof.ts <editor-svg> <proof-directory>
```

The report binds the actual editor SVG, board draft and maintained source by SHA-256. Source masks are independent of the editor's crop geometry. It saves both rendered maps and reports full-image differences as well as territory coverage. The recreated artwork is not a byte-identical legacy raster; residual stroke and antialiasing differences are recorded rather than hidden.

The study remains on its throwaway branch for visual review. General split and merge identity, complete keyboard interaction, pathological intersections and production save/publication remain later work. The one-time Arrakis preset does not require a general SVG conversion service.
