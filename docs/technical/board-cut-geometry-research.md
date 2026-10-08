# Geometry for shared-cut board editing

Research date: 2026-10-08. Repository baseline: `c00cfd01b0e28ff37b873db5b9c31bc9a730ebc3`.

This note resolves [Research geometry for shared-cut board editing](https://github.com/ndelangen/dunezone/issues/1966) under [Create and publish custom board assets](https://github.com/ndelangen/dunezone/issues/1959). It follows the [settled geometry contract](https://github.com/ndelangen/dunezone/issues/1960#issuecomment-6056787868). This is source research. No geometry prototype, dependency installation, editor implementation, performance measurement, or exact Arrakis reconstruction ran during this investigation.

## Recommendation

Try a small shared geometry module with lossless authored lines, Bézier curves and circular arcs, a derived noded line graph, and JSTS polygonization for territory faces. Keep every authored cut available to the renderer, including cuts that form no face. Start the spacing study with SVG strokes or a stroke mask on those same shared cuts. Add polygon offsets only if the appearance study proves they are needed.

This is a candidate for a feasibility study, not a proven complete algorithm. JSTS addresses straight-line topology. It does not supply an exact curve arrangement or preserve SVG arc commands. A successful study must recover curved face boundaries from their source edges and validate their junctions. Publishing flattened polygons alone does not satisfy the confirmed requirement to reproduce Arrakis exactly.

Paper.js is worth testing for editor curve manipulation and curve intersection helpers. Its path model should not become the persisted board authority because it converts circular arcs to cubic approximations. CGAL is the stronger exact-arrangement reference if the lightweight approach fails, with a much larger integration and licensing burden.

## What the source establishes

SVG paths support line segments, quadratic and cubic Bézier curves, circular or elliptical arcs, and multiple subpaths for holes. SVG therefore has the output vocabulary needed for the proposed board geometry. This establishes representation, not the correctness of a face-extraction algorithm. [SVG path specification](https://www.w3.org/TR/SVG2/paths.html)

The repository's [Arrakis definition](https://github.com/ndelangen/dunezone/blob/c00cfd01b0e28ff37b873db5b9c31bc9a730ebc3/src/shared/rulebooks/boards/arrakis.json) already stores highlight path data and transforms. The [tabletop SVG](https://github.com/ndelangen/dunezone/blob/c00cfd01b0e28ff37b873db5b9c31bc9a730ebc3/src/app/widgets/tabletop/assets/arrakis-map.svg) is another rendering reference. These files are acceptance material, not evidence that their outlines already share editable boundaries. This investigation did not recover centerlines from them or establish that one constant gap reproduces every existing outline.

### JSTS for linework and faces

JTS Polygonizer consumes a planar line graph. Intersections must already be split into edge endpoints, a process called noding. It reports dangling edges, connected edges that form no polygon, and invalid rings separately. The default constructor extracts all polygons; `extractOnlyPolygonal=true` can discard areas, so that mode is a poor starting point for enumerating every board territory. [JTS Polygonizer contract](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/polygonize/Polygonizer.html)

The current JSTS port removes dangles and cut edges from its working polygonization graph, then builds rings, classifies shells and holes, and assigns holes to shells. It exposes the removed line collections. The board can preserve the authored cuts independently and treat these results as topology classifications rather than authoring errors. Nested loops need a fixture proving that an enclosed territory and its surrounding territory both appear, with the inner territory excluded from the outer fill. [JSTS Polygonizer source](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/src/org/locationtech/jts/operation/polygonize/Polygonizer.js)

JSTS has a snap-rounding noder using a precision model, an indexed noder and robust line intersection calculations. Its segment-string representation carries associated data, which is useful for retaining a source-edge pointer. This does not prove that source curve parameters survive every noding or deduplication operation; the adapter must check that. [Snap-rounding source](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/src/org/locationtech/jts/noding/snapround/MCIndexSnapRounder.js), [segment-string source](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/src/org/locationtech/jts/noding/NodedSegmentString.js)

Do not assume the newest Java JTS algorithm exists in its JavaScript port. Modern JTS documents `SnapRoundingNoder`, while the inspected JSTS implementation is `MCIndexSnapRounder`. Java documentation establishes intended concepts; the pinned JavaScript source establishes the code available for this study. [Modern JTS noder](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/noding/snapround/SnapRoundingNoder.html)

JSTS explicitly documents possible precision-related `TopologyException` failures. It supports browser bundles and individual ES-module imports. Its inspected package declares version 2.12.1, one runtime dependency, `fastpriorityqueue`, and the license choice `EDL-1.0 OR EPL-1.0`. Use the package's own license files and notices, not the different license version of current Java JTS. [JSTS usage and caveats](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/README.md), [package declaration](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/package.json), [EDL license](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/LICENSE_EDLv1.txt)

### Paper.js for curves

Paper.js supports open and closed paths, compound paths, Bézier handles, path intersections and crossing classification. Those are useful editor operations, but shape Boolean operations do not themselves establish a complete partition from arbitrary open cuts. Its source uses floating-point tolerances. [Path intersections source](https://github.com/paperjs/paper.js/blob/92775f5279c05fb7f0a743e9e7fa02cd40ec1e70/src/path/PathItem.js)

Paper.js converts SVG arc commands through `arcTo` into cubic segments of at most roughly 90 degrees. Its exporter emits lines and cubics from that representation. Preserve authored circular arcs outside this conversion if exact arc identity matters. The source carries the MIT license. [Arc conversion and path serialization](https://github.com/paperjs/paper.js/blob/92775f5279c05fb7f0a743e9e7fa02cd40ec1e70/src/path/Path.js)

The flattening tutorial promises a specified maximum deviation. The inspected implementation also stops subdividing at a minimum parameter span derived from `maxRecursion`. Consequently, the documentation alone does not establish an unconditional error bound for extreme curves or arbitrarily small tolerances. A study should detect subdivision exhaustion and validate the actual deviation rather than silently assuming the requested value was achieved. [Flattening documentation](https://paperjs.org/tutorials/paths/smoothing-simplifying-flattening/), [flattening implementation](https://github.com/paperjs/paper.js/blob/92775f5279c05fb7f0a743e9e7fa02cd40ec1e70/src/path/PathFlattener.js)

### Clipper2 for derived offsets

Clipper2 offers polygon clipping and offsets, including open-path stroke expansion. It computes with integer coordinates internally even through its floating-point entry points. Its official implementations are C++, C# and Delphi, so a JavaScript or WebAssembly integration would require a separately checked port or build. The official project uses the Boost Software License 1.0. It is an optional offset engine here, not a complete curve-aware board editor or arbitrary linework polygonizer. [Clipper2 overview](https://angusj.com/clipper2/Docs/Overview.htm), [license](https://github.com/AngusJohnson/Clipper2/blob/main/LICENSE)

Offsets require attention to winding, holes, joins, short segments and pre-existing intersections. Clipper2 warns that output path order can change. A negative closed-polygon offset can erase narrow regions, so derived visual geometry must never decide which territory identities survive. [ClipperOffset contract](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm)

### CGAL for exact arrangements

CGAL arrangements explicitly model vertices, halfedges, faces and holes, with traits for segments, circular arcs and Bézier curves. Bézier intersection coordinates may be algebraic numbers; its implementation filters approximate calculations and falls back to exact calculations when needed. The documented example requires GMP and CORE. This is stronger evidence for exact topology than a general SVG-editing library provides, but it does not establish a ready browser build for this repository. [CGAL arrangement manual](https://doc.cgal.org/latest/Arrangement_on_surface_2/index.html)

CGAL packages use GPL or LGPL terms, with commercial licensing available. The selected arrangement package and number-library dependencies need their own license review before adoption. A custom C++/WebAssembly build, initialization cost and bundle size would need investigation. Do not infer Worker compatibility from the C++ API. [CGAL licensing](https://www.cgal.org/license.html)

## Candidate data flow and its unproved parts

The following is a proposed design based on those sources, not a library guarantee.

1. Store a circle plus ordered authored cuts. Give geometric edges persistent technical keys distinct from editable territory names. Retain line coordinates, Bézier controls and arc parameters. Keep explicit endpoint-to-boundary connections so an intended connection survives curve sampling.
2. Compute a disposable graph from that source. Sample each curve with a stated error target and retain the source edge and parameter interval on every sample. Insert the circle boundary into the same graph. Node actual intersections, deduplicate coincident derived segments, then polygonize.
3. Enumerate closed faces with their holes. Preserve all source cuts for artwork whether or not they belong to a face. A bridge joining two loops is still visible even when polygonization classifies it as a cut edge.
4. Reconstruct curved face paths from oriented source-edge intervals. Refine curve intersections and validate common endpoints. Polygon chord intersections only provide candidates; their parameter estimates are insufficient proof of exact curve junctions. Ambiguous tangencies and coincident intervals need explicit handling.
5. Match old and new territory records for the edit, then apply the approved deterministic-first retention rule. Reuse the original source for the gap treatment and open-cut artwork. Keep published face paths and editor face paths on the same versioned computation.

The risky part is step 4. A line approximation can classify topology differently near a tangency even when its visible deviation is tiny. A global small tolerance does not fix that. If source-to-face reconstruction and intersection refinement cannot pass the fixtures below, reconsider a curve arrangement implementation. Do not weaken exact Arrakis compatibility through an undocumented approximation.

## Numerical limits

For a feasibility fixture, normalize the board diameter to 1000 units and try a flattening target of 0.001 units. At a 4096-pixel render, that requested deviation corresponds to 0.004096 pixels. This is a proposed test setting, not a measured guarantee or a final product limit.

A circular arc can use a direct sagitta bound, `e = r * (1 - cos(theta / 2))`. Subdivide until each chord satisfies the chosen `e`. Sampling a true circular arc directly avoids adding Paper.js's arc-to-cubic conversion error. For Béziers, select and verify an adaptive subdivision bound; a recursion cap must report failure to meet the requested error.

If a derived grid uses step `g`, rounding a single vertex to the nearest grid point moves it by at most `g / sqrt(2)` in two dimensions. That bound is only for one rounding operation. It is not a bound on all snap-rounding changes, a curved face reconstruction, or topology preservation.

Distances close to the combined sampling and grid error require investigation. Do not silently close a nearly closed authored cut, merge distinct nearby cuts, remove a tiny valid face, or discard an intentional dangling edge. Numerical rounding is separate from the author's optional sector snapping. Explicit authoring connections should take precedence over guessing intent from proximity.

## Deterministic naming without area ranking

Do not use raw library result order as the identity contract. JSTS currently sorts shells by an envelope comparator; Clipper2 says offset output order may change. Neither promises the application's name-retention behavior. [JSTS shell sorting](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/src/org/locationtech/jts/operation/polygonize/Polygonizer.js), [Clipper2 ordering warning](https://angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm)

A small candidate rule is to canonicalize each face's oriented source-edge sequence, rotate it to its smallest edge key, and sort by that sequence. Break any remaining ties with a documented coordinate ordering. On merge, use saved territory order. This avoids area ranking and makes repeated computation testable. It remains a technical proposal. Matching old faces to new faces, especially after moving a curve, needs its own fixture; sorting alone does not solve that association.

## Consistent spacing

SVG defines stroke widths, caps, joins, miter limits and dash patterns. Filling territories to the shared boundary, then painting the shared cuts once with a fixed-width stroke, is the smallest rendering experiment. A mask can instead remove that stroke from fills where the board background must remain visible. Draw open cuts through the same authored path layer. [SVG painting specification](https://www.w3.org/TR/SVG2/painting.html)

This avoids independently authored neighboring outlines and retains original curves. It does not prove that every Arrakis inset contour, corner or dashed treatment can use one such stroke. A separate inset ornament may require derived offsets or another appearance rule. Examine that in the appearance prototype. Keep visual erosion separate from territory topology, especially for narrow strongholds and holes. Hit areas and highlight paths must also respect the chosen gap treatment.

## Runtime and publication

The inspected JSTS geometry modules are ES modules with ordinary geometry objects. Their browser support makes one DOM-free computation shared between the editor and publication a plausible option. Actual browser Web Worker and Cloudflare Worker bundle compatibility remains untested, including transitive imports, memory and startup cost. Paper.js is oriented around its project and view model; check its Node environment adapters and global environment assumptions before sharing it with publication. [JSTS packaging](https://github.com/bjornharrtell/jsts/blob/34166d7e96f2b1f3a099a20c9408741a9a7cacec/package.json), [Paper.js package](https://github.com/paperjs/paper.js/blob/92775f5279c05fb7f0a743e9e7fa02cd40ec1e70/package.json)

Pin dependency versions, precision settings, curve sampling and output ordering together. The same input and computation version should produce the same territory paths in the editor, board capture and Spice-card recapture. Storing the authored geometry plus a revision-bound derived result is a candidate, while publication and recapture policy remain with their decision ticket. No card data rewrite is necessary for geometry regeneration.

Sampling increases segment count; heavily intersecting cuts increase graph size further. Indexed noding helps find candidates, but source inspection gives no response-time bound for these boards. No performance or memory numbers are claimed here.

## Smallest next feasibility checks

1. Use one disposable geometry study with a circle, one boundary-to-boundary cut, a closed stronghold, a central polar loop, a loop nested inside another loop, a loop-to-loop bridge and a dangling branch. Confirm expected faces, holes and visible open cuts. Save, reload and recompute without changing names.
2. Add crossing Béziers, a native circular arc, a tangent contact, a T-junction, reversed duplicate linework, overlapping curve intervals, almost-touching endpoints and a tiny enclosed region. Compare results at half the sampling error and grid size. Changing topology under refinement is a failure to investigate, not permission to discard geometry.
3. Recover face SVG from source intervals and demonstrate that arcs remain arcs and Bézier controls survive unchanged away from new intersection points. Check both sides of every shared boundary and confirm that a highlight excludes enclosed neighboring territories.
4. Recreate a representative Arrakis patch containing an irregular boundary, stronghold, inset treatment and Polar Sink boundary. Compare SVG geometry and rendered artwork with the existing references. A full exact-recreation acceptance check is still required later. This patch should reveal incompatible gap assumptions before editor implementation.
5. Repeat split, merge, boundary movement and save/reload operations in shuffled graph-processing orders. Confirm deterministic name retention without area ranking. Bundle the same study for a browser Web Worker and the publication Worker. Measure elapsed time, peak memory where available, segment count and bundle size on the Arrakis-sized case and a denser stress fixture.

Stop before production geometry work if curved junctions cannot be validated, nested faces disappear, open cuts vanish, names depend on incidental library order, or the Arrakis patch requires independently edited neighboring boundaries. The study must explain each failure or choose another computation approach. The research establishes a credible path to that study; it does not establish that the final editor is already feasible at an acceptable speed.
