import preview from '@sb/preview';

import { Token } from './Token';

const meta = preview.meta({
  component: Token,
  globals: {
    viewport: {
      value: 'disc',
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
    logo: '/vector/logo/moritani.svg',
  },
});
