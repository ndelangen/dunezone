import preview from '@sb/preview';

import { ListIcons } from './Icons.stories.fixture';

const meta = preview.meta({
  component: ListIcons,
  tags: ['no-screenshot'],
  parameters: {
    layout: 'padded',
  },
  globals: {
    viewport: {
      value: undefined,
    },
  },
});

export const Icons = meta.story({
  args: {
    pattern: '*',
    type: 'icon',
  },
});

export const Troops = meta.story({
  args: {
    pattern: '*',
    type: 'troop',
  },
});

export const Generics = meta.story({
  args: {
    pattern: '*',
    type: 'generic',
  },
});

export const Logos = meta.story({
  args: {
    pattern: '*',
    type: 'logo',
  },
});
