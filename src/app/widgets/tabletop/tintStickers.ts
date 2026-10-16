import type { TintStamp } from '@shared/play/territoryTints';

import atomicsSvg from '../../../../media/vector/decal/atomics.svg?raw';
import palaceSvg from '../../../../media/vector/decal/palace.svg?raw';
import citySvg from '../../../../media/vector/icon/arrakis-city.svg?raw';
import sietchSvg from '../../../../media/vector/icon/arrakis-sietch.svg?raw';

/* The board's own glyphs carry an outline path for the board's halo; a sticker draws its own, so it is left out. */
const withoutOutline = (svg: string) => svg.replace(/<path[^>]*data-decal-outline[^>]*\/>/g, '');

/** Each sticker's artwork, with the label its switch on a tint's row carries, in the order they sit side by side. */
export const TINT_STICKERS: Record<TintStamp, { label: string; svg: string }> = {
  sietch: { label: 'Sietch stickers', svg: withoutOutline(sietchSvg) },
  city: { label: 'City stickers', svg: withoutOutline(citySvg) },
  palace: { label: 'Palace stickers', svg: palaceSvg },
  atomics: { label: 'Explosion stickers', svg: atomicsSvg },
};
