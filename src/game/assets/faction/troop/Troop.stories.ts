import preview from '@sb/preview';

import { TroopToken } from './Troop';

const meta = preview.meta({
  component: TroopToken,
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
    star: '/vector/troop_modifier/star-left-red.svg',
    striped: false,
    image: '/vector/troop/atreides.svg',
  },
});
