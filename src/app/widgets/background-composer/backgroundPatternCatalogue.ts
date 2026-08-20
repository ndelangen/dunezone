import { BACKGROUND, TEXTURE } from '@shared/assetIds';

import type { Faction } from '@db/factions';

type BackgroundPatternPath = Faction['background']['image'];

export type BackgroundPatternOption = {
  image: BackgroundPatternPath;
  label: string;
};

export const BACKGROUND_PATTERN_CATALOGUE = [
  ...BACKGROUND.options.map((image) => ({
    image,
    label: image.endsWith('/map.svg') ? 'Map lines' : 'Moons',
  })),
  ...TEXTURE.options.map((image) => {
    const number = image.slice('/image/texture/'.length, -'.jpg'.length);
    return {
      image,
      label: `Texture ${number}`,
    };
  }),
] satisfies readonly BackgroundPatternOption[];
