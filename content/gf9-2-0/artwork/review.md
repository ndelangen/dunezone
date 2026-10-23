# GF9 2.0 decal review

Reviewed the artwork against the supplied card photographs and deck sheets on 23 October 2026. The [reference crops](references) and [provenance](provenance.json) identify the source material. Little Maker is approved. Karama 2.0 now starts from a clone of the [existing Karama vector](../../../media/vector/icon/karama.svg), preserving its native glyph contours. The older asset remains unchanged.

| Artwork | Findings | Changes |
| --- | --- | --- |
| Karama 2.0 | Tracing the scan distorted the glyphs and obscured the repeated construction. The existing vector already contains seven of the required ray symbols as clean paths. | Clone that vector, retain those contours, and change the geometric construction and two changed symbols as described below. |
| Little Maker | The first threshold merged the olive engraved band with the dark frame, weakened the pale mouth contour and produced a notch in the left frame. | Refine the monochrome trace with subpixel smoothing and a threshold that preserves the narrow pale contours. Add a multicolour partner with separate dark ink, olive band and pale water. Remove isolated dark texture specks outside the worm, while retaining the small mouth marks. |
| Solaris | All four coin faces, their rim strokes, the planet's small marks, the star, the animal head and the human profile are present. Some fine engraving follows the softness of the photograph. | Retain the existing trace. Further smoothing softened the engraving without revealing a missing motif. |

## Karama construction and changes

The existing vector separates eight kite-shaped rays, a central octagon and eight broad circular sectors. The 2.0 image supports the following reconstruction. The original authoring objects are inferred from the repeated shapes, rather than recoverable from the raster source.

| Part | Existing vector | 2.0 reconstruction |
| --- | --- | --- |
| Rays | Eight separate kites with narrow shoulders. | Wider shoulders join into a star. The diagonal tips are slightly shorter. |
| Circular shape | Eight broad filled sectors. | A thin circular rim, exposed between the rays. |
| Centre | Small octagon with three waves. | Larger octagon with a circular ring. |
| Spaces between rays | Open channels around the separate kites. | Eight large triangular openings and eight small triangular openings, repeated around the centre. |
| Seven ray glyphs | Loop, arch, ring, cup, diamond, figure-eight and eye contours. | The same original path contours, moved outward and scaled to fit the new placement. No raster tracing. |
| East ray | Mountains. | Two interlaced waves with enclosed openings. |

The star envelope comes from the widened kite edges. Each large triangle uses the enlarged octagon's edge and a repeated outer point; the small triangles use the same radial construction. The central ring uses concentric circles. These repeated parameters replace the earlier fitted scan points.

Karama's bold circular rim is part of the motif. The faint outer circle and long radial lines are shared card background guides and stay out of the decal. The exposed rim arcs stop at the star edges so they cannot fill its transparent glyphs. The vector remains a working reconstruction for visual review against the card, with the retained glyphs providing the starting geometry.

Little Maker's multicolour palette approximates the supplied deck sheet. Its pale water is opaque artwork, while the outer corners remain transparent. The monochrome partner keeps pale areas transparent and inherits the caller's colour. Both retain the basin, engraved marks, worm segments, mouth spots and water ripples.

Solaris's fine engraving still follows the source photograph's softness. No further missing motif is apparent in these references.

The Karama rebuild passed all 20 media catalogue tests, vector generation and validation, and the publisher build with its HTML runtime check. Rendered comparisons covered the existing vector, the 2.0 card artwork and the rebuilt file, including dark backgrounds and widths of 64, 128 and 256 pixels. The original Karama asset and both Little Maker files remain unchanged.

Little Maker's earlier verification passed 8 AssetSelect Storybook tests, and its colour variant was selected in the actual picker. Transparency checks confirmed the colour variant's opaque water and transparent corners, and the monochrome version's transparent water.
