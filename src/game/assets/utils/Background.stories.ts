import preview from '@sb/preview';

import { backgroundPresets } from '../../data/backgrounds';
import { Background } from './Background';

const meta = preview.meta({
  component: Background,
});

export const SubtleTexture = meta.story({
  args: {
    image: '/image/texture/021.jpg',
    colors: ['#781F1F', '#1F3C78'],
    influence: 0.15,
    invert: true,
    definition: 0.2,
  },
});

export const DominantTexture = meta.story({
  args: {
    image: '/image/texture/011.jpg',
    colors: ['#D6409F', '#1DA6D8'],
    influence: 0.9,
    invert: false,
    definition: 1,
  },
});

export const LinearGradient = meta.story({
  args: {
    image: '/image/texture/011.jpg',
    colors: [
      {
        type: 'linear',
        angle: 45,
        stops: [
          ['#FF0000', 0],
          ['#4444FF', 1],
        ],
      },
      '#D97706',
    ],
    influence: 0.7,
    invert: false,
    definition: 1,
  },
});

export const RadialGradient = meta.story({
  args: {
    image: '/image/texture/054.jpg',
    colors: [
      '#FFFFFF',
      {
        type: 'radial',
        x: 50,
        y: 100,
        r: 100,
        stops: [
          ['#FF9999', 0],
          ['#FFFF99', 0.4],
          ['#99FF99', 0.8],
          ['#99FFFF', 1],
        ],
      },
    ],
    influence: 1,
    invert: false,
    definition: 1,
  },
});

export const InvertedPattern = meta.story({
  args: {
    ...backgroundPresets.atreides,
    invert: true,
  },
});

export const FactionIdentity = meta.story({
  args: backgroundPresets.beneGesserit,
});

export const RadialToken = meta.story({
  args: backgroundPresets.terror,
});

export const StripedTreatment = meta.story({
  args: backgroundPresets.stripedWeapon,
});
