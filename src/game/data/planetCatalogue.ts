import { PLANET } from './generated';

export const CURATED_PLANET_IMAGES = PLANET.options.map((image, index) => ({
  id: `planet-${String(index + 1).padStart(2, '0')}`,
  image,
  label: `Planet illustration ${String(index + 1).padStart(2, '0')}`,
}));

export type CuratedPlanetImage = (typeof CURATED_PLANET_IMAGES)[number];
