import preview from '@sb/preview';

import { backgroundPresets } from '../../data/backgrounds';
import { CardBack } from './Back';

const meta = preview.meta({
  component: CardBack,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Icon = meta.story({
  args: {
    name: 'Traitor',
    background: backgroundPresets.traitor,
    image: '/vector/icon/traitor.svg',
    imageOffset: [0, 10],
    imageScale: 1.1,
  },
});

export const FactionLogo = meta.story({
  args: {
    name: 'Prescience',
    background: backgroundPresets.atreides,
    image: '/vector/logo/atreides.svg',
    imageOffset: [0, 5],
    imageScale: 1.1,
  },
});

export const CompactSymbol = meta.story({
  args: {
    name: 'Storm',
    background: backgroundPresets.storm,
    image: '/vector/icon/storrm_standalone.svg',
    imageOffset: [0, 5],
    imageScale: 0.8,
  },
});

export const OversizedSymbol = meta.story({
  args: {
    name: 'Alliance',
    background: backgroundPresets.alliance,
    image: '/vector/icon/alliance.svg',
    imageOffset: [-5, 20],
    imageScale: 1.35,
  },
});
