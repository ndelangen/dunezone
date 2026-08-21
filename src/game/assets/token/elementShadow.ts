/**
 * The one shadow an author can put under a token's ring or a decal.
 * A single filter string rather than two hand-rolled effects, so the ring's shadow and a decal's read as the same light.
 * Offset downward, unlike the renderer's built-in zero-offset glows, so it reads as elevation rather than bloom.
 * Applied as a style, not the SVG presentation attribute: the attribute's grammar takes url() references, and engines differ on whether CSS filter functions in it apply.
 */
export const ELEMENT_SHADOW_FILTER = 'drop-shadow(0 4px 6px rgb(0 0 0 / 0.7)) drop-shadow(0 1px 2px rgb(0 0 0 / 0.5))';
