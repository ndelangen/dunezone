# GF9 2.0 decal review

Reviewed the three first traces against the supplied card photographs and deck sheets on 23 October 2026. The [reference crops](references) and [provenance](provenance.json) identify the source material. The artwork remains separate from older Karama and Solaris assets.

| Artwork | Findings | Changes |
| --- | --- | --- |
| Karama 2.0 | The first trace omitted the lower-right large triangle, the bold circular rim and several small openings beside the diagonal rays. Raster thresholding left uneven triangle edges and a lumpy central ring. | Draw the star and all eight large triangles with straight segments. Restore the eight small ray openings and bold rim. Use concentric circles for the centre and the upper-right ring glyph. Keep the other source-traced glyphs. |
| Little Maker | The first threshold merged the olive engraved band with the dark frame, weakened the pale mouth contour and produced a notch in the left frame. | Refine the monochrome trace with subpixel smoothing and a threshold that preserves the narrow pale contours. Add a multicolour partner with separate dark ink, olive band and pale water. Remove isolated dark texture specks outside the worm, while retaining the small mouth marks. |
| Solaris | All four coin faces, their rim strokes, the planet's small marks, the star, the animal head and the human profile are present. Some fine engraving follows the softness of the photograph. | Retain the existing trace. Further smoothing softened the engraving without revealing a missing motif. |

Karama's bold circular rim is part of the motif. The faint outer circle and long radial lines are shared card background guides and stay out of the decal. The exposed rim arcs stop at the star edges so they cannot fill its transparent glyphs.

Little Maker's multicolour palette approximates the supplied deck sheet. Its pale water is opaque artwork, while the outer corners remain transparent. The monochrome partner keeps pale areas transparent and inherits the caller's colour. Both retain the basin, engraved marks, worm segments, mouth spots and water ripples.

The remaining opportunities are small contour refinements in Karama's traced glyphs and Solaris's engraving. A sharper source would help distinguish intentional pen marks from blur. No further missing motif is apparent in these references.

Verification passed for all 20 media catalogue tests, 8 AssetSelect Storybook tests, vector generation and validation, and the publisher build with its HTML runtime check. The new colour variant was selected in the actual picker. Rendered comparisons covered the sources, the previous traces, the revised files, dark backgrounds and widths of 64, 128 and 256 pixels. Transparency checks confirmed the colour variant's opaque water and transparent corners, and the monochrome version's transparent water.
