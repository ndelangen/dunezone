import preview from '@sb/preview';

import { AllianceCard } from './Alliance';

const meta = preview.meta({
  component: AllianceCard,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Default = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['red', 'blue'],
      invert: true,
      definition: 0,
      influence: 0,
    },
    logo: '/vector/logo/atreides.svg',
    title: 'Atreides',
    decals: [
      {
        id: '/vector/icon/eye.svg',
        muted: true,
        offset: [-80, -60],
        outline: false,
        scale: 0.45,
      },
      {
        id: '/vector/icon/kwisatz.svg',
        muted: true,
        offset: [220, 50],
        outline: false,
        scale: 0.7,
      },
    ],
    text: "Atreides may use Battle Prescience in their ally's battles.",
    troop: '/vector/troop/atreides.svg',
  },
});
