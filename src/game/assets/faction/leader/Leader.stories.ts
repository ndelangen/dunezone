import preview from '@sb/preview';
import type { ComponentProps } from 'react';

import { LeaderToken } from './Leader';

const meta = preview.meta({
  component: LeaderToken,
  globals: {
    viewport: {
      value: 'disc',
    },
  },
  argTypes: {
    image: {
      control: {
        type: 'select',
      },
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
    image: '/image/leader/official/tessia.png',
    logo: '/vector/logo/moritani.svg',
    name: 'Vando Terboli',
    strength: '1',
  },
});

const hiverToken = {
  background: {
    image: '/image/texture/021.jpg',
    colors: ['#ac632b', '#302a20'],
    invert: false,
    definition: 0,
    influence: 0,
  },
  logo: '/vector/logo/obsidian-mantis.svg',
  strength: '5',
} satisfies Pick<ComponentProps<typeof LeaderToken>, 'background' | 'logo' | 'strength'>;

export const HiverAmberPendant = meta.story({
  args: { ...hiverToken, image: '/image/leader/hivers/hiver-amber-pendant.png', name: 'Amber Pendant' },
});

export const HiverFurMantle = meta.story({
  args: { ...hiverToken, image: '/image/leader/hivers/hiver-fur-mantle.png', name: 'Fur Mantle' },
});

export const HiverHighCrown = meta.story({
  args: { ...hiverToken, image: '/image/leader/hivers/hiver-high-crown.png', name: 'High Crown' },
});

export const HiverHornedMask = meta.story({
  args: { ...hiverToken, image: '/image/leader/hivers/hiver-horned-mask.png', name: 'Horned Mask' },
});

export const HiverBlackRuff = meta.story({
  args: { ...hiverToken, image: '/image/leader/hivers/hiver-black-ruff.png', name: 'Black Ruff' },
});
