# GF9 2.0 decal review

Reviewed the artwork against the supplied card photographs and deck sheets on 23 October 2026. The [reference crops](references) and [provenance](provenance.json) identify the source material. Little Maker is approved. Karama 2.0 now starts from a clone of the [existing Karama vector](../../../media/vector/icon/karama.svg), preserving its native glyph contours. The older asset remains unchanged.

| Artwork | Findings | Changes |
| --- | --- | --- |
| Karama 2.0 | Tracing the scan distorted the glyphs and obscured the repeated construction. The existing vector already contains seven of the required ray symbols as clean paths. | Clone that vector, retain those contours, and change the geometric construction and two changed symbols as described below. |
| Little Maker | The first threshold merged the olive engraved band with the dark frame, weakened the pale mouth contour and produced a notch in the left frame. | Refine the monochrome trace with subpixel smoothing and a threshold that preserves the narrow pale contours. Add a multicolour partner with separate dark ink, olive band and pale water. Remove isolated dark texture specks outside the worm, while retaining the small mouth marks. |
| Solaris | All four coin faces, their rim strokes, the planet's small marks, the star, the animal head and the human profile are present. Some fine engraving follows the softness of the photograph. | Retain the existing trace. Further smoothing softened the engraving without revealing a missing motif. |

## Karama construction and changes

The existing vector separates eight kite-shaped rays, a central octagon and eight broad circular sectors. Enlarging both source crops six times makes the second dark circle visible around the ray bases. The 2.0 design retains both circular boundaries as outlines. The following construction uses overlapping components, rather than fitting individual triangular holes to the scan.

| Part | Existing vector | 2.0 reconstruction |
| --- | --- | --- |
| Rays | Eight separate kites with narrow shoulders. | Wider shoulders join into a star. The diagonal tips are slightly shorter. |
| Circular shape | Eight broad filled sectors between an inner and outer circular boundary. | Two thin concentric circles, exposed between the rays. The inner circle joins the ray bases. |
| Centre | Small octagon with three waves. | Larger octagon with a circular ring. |
| Spaces between rays | Open channels around the separate kites. | Large and small triangular spaces arise naturally from the overlapping kites, enlarged octagon and both circles. Their curved boundaries follow the circles. |
| Seven ray glyphs | Loop, arch, ring, cup, diamond, figure-eight and eye contours. | The same original path contours, moved outward and scaled to fit the new placement. No raster tracing. |
| East ray | Filled mountain silhouette. | Thin, uneven hill and dune ridgelines with tapered ends and overlapping slopes. |

Each ray is a rotated copy of the same kite geometry, with slightly shorter diagonal tips. The enlarged original octagon fills the centre. Both circular boundaries remain separate path components. Their exposed arcs stop at the kite edges, preserving the transparent glyphs. The middle symbol is a circular ring. There are no independent triangle cutouts.

Both dark circles are part of Karama's motif. The faint circle beyond them and the long radial lines are shared card background guides and stay out of the decal. The vector remains a working reconstruction for visual review against the card, with the retained glyphs providing the starting geometry.

The user accepted this construction and requested [variant A](variants/karama-2-0-A.svg) as a recoverable checkpoint. That file is byte-for-byte identical to the decal at commit `aa500f5b587`. Subsequent changes affect only the hills inside the eastern point. The bitmap shows thin, irregular ridgelines, with unequal peaks and tapered ends. The current refinement uses curved contours in place of variant A's thick regular zigzag. Every other path component remains unchanged.

Little Maker's multicolour palette approximates the supplied deck sheet. Its pale water is opaque artwork, while the outer corners remain transparent. The monochrome partner keeps pale areas transparent and inherits the caller's colour. Both retain the basin, engraved marks, worm segments, mouth spots and water ripples.

Solaris's fine engraving still follows the source photograph's softness. No further missing motif is apparent in these references.

The Karama rebuild passed all 20 media catalogue tests, vector generation and validation, and the publisher build with its HTML runtime check. Rendered comparisons covered the existing vector, the 2.0 card artwork and the rebuilt file, including dark backgrounds and widths of 64, 128 and 256 pixels. The original Karama asset and both Little Maker files remain unchanged.

Little Maker's earlier verification passed 8 AssetSelect Storybook tests, and its colour variant was selected in the actual picker. Transparency checks confirmed the colour variant's opaque water and transparent corners, and the monochrome version's transparent water.
