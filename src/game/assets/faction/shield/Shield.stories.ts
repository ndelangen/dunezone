import preview from '@sb/preview';

import { Shield } from './Shield';

const meta = preview.meta({
  component: Shield,
  globals: {
    viewport: {
      value: 'shield',
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
    leader: {
      name: 'Atreides',
      image: '/image/leader/official/paul.jpg',
    },
    logo: '/vector/logo/atreides.svg',
    name: 'Atreides',
  },
});
