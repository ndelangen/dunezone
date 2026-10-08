import arrakisCity from '../../../../media/vector/icon/arrakis-city.svg?raw';
import arrakisSietch from '../../../../media/vector/icon/arrakis-sietch.svg?raw';
import city from '../../../../media/vector/icon/city.svg?raw';
import ornithopter from '../../../../media/vector/icon/ornithopter.svg?raw';
import sietch from '../../../../media/vector/icon/seitch.svg?raw';

/** Shared preset glyphs carry removable outline paths; other vectors load through SVG images. */
export const BOARD_ARTWORK: Record<string, string> = {
  '/vector/icon/city.svg': city,
  '/vector/icon/seitch.svg': sietch,
  '/vector/icon/ornithopter.svg': ornithopter,
  '/vector/icon/arrakis-city.svg': arrakisCity,
  '/vector/icon/arrakis-sietch.svg': arrakisSietch,
};
