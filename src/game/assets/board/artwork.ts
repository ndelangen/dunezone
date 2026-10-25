import { VECTOR_ARTWORK_ALIASES } from '@shared/vectorRules';

import city from '../../../../media/vector/icon/city.svg?raw';
import ornithopter from '../../../../media/vector/icon/ornithopter.svg?raw';
import sietch from '../../../../media/vector/icon/seitch.svg?raw';

const plainArtwork: Record<string, string> = {
  '/vector/icon/city.svg': city,
  '/vector/icon/seitch.svg': sietch,
  '/vector/icon/ornithopter.svg': ornithopter,
};

/** Plain glyphs share the renderer's ink and optional outline, including references saved under retired names. */
export const BOARD_ARTWORK: Record<string, string> = {
  ...plainArtwork,
  ...Object.fromEntries(Object.entries(VECTOR_ARTWORK_ALIASES).map(([alias, target]) => [alias, plainArtwork[target]])),
};
