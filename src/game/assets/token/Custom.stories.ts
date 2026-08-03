import preview from '@sb/preview';

import { backgroundPresets } from '../../data/backgrounds';
import { CustomToken } from './Custom';

const meta = preview.meta({
  component: CustomToken,
  argTypes: {
    image: {
      control: {
        type: 'select',
      },
    },
  },
  globals: {
    viewport: {
      value: 'disc',
    },
  },
});

export const SymbolToken = meta.story({
  args: {
    background: backgroundPresets.techRed,
    image: '/vector/icon/ambassador.svg',
    circle: false,
  },
});

export const Bordered = meta.story({
  args: {
    background: backgroundPresets.techBlue,
    image: '/vector/icon/heighliners.svg',
    circle: true,
  },
});

export const CurvedLabels = meta.story({
  args: {
    background: backgroundPresets.techYellow,
    image: '/vector/troop/pewpew.svg',
    circle: false,
    top: 'Pew Pew',
    bottom: 'Delivery phase\nTeam Sparlock',
    size: { width: 160, height: 160 },
  },
});

export const OutlinedArtwork = meta.story({
  args: {
    background: backgroundPresets.hiereg,
    image: '/vector/decal/ecological-testing-station.svg',
    circle: false,
    size: { width: 180, height: 180 },
    fill: '#000000',
    stroke: '#FFFFFF',
    strokeWidth: 2,
  },
});

export const TerrorTreatment = meta.story({
  args: {
    background: backgroundPresets.terror,
    image: '/vector/decal/extortion.svg',
    circle: false,
    size: { width: 170, height: 170 },
    fill: '#000000',
    stroke: '#DED4A3',
    strokeWidth: 8,
  },
});

export const Spice = meta.story({
  args: {
    background: backgroundPresets.spiceToken,
    image: '/vector/icon/spice.svg',
    circle: false,
    size: { width: 190, height: 190 },
  },
});
