export const BOARD_GLYPH_INK = '#1a0b00';
const OUTLINE_COLOR = '#fffed8';
const OUTLINE_RADIUS = 0.5;

/** The same pale outline for authored decals and placed stickers, in board units. */
export function GlyphOutlineFilter({ id, recolor = false }: Readonly<{ id: string; recolor?: boolean }>) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius={OUTLINE_RADIUS} result="WIDE" />
      <feFlood floodColor={OUTLINE_COLOR} result="PALE" />
      <feComposite in="PALE" in2="WIDE" operator="in" result="OUTLINE" />
      {recolor && <feFlood floodColor={BOARD_GLYPH_INK} result="DARK" />}
      {recolor && <feComposite in="DARK" in2="SourceAlpha" operator="in" result="INK" />}
      <feMerge>
        <feMergeNode in="OUTLINE" />
        <feMergeNode in={recolor ? 'INK' : 'SourceGraphic'} />
      </feMerge>
    </filter>
  );
}
