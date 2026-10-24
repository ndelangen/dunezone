import { testingPreview } from '@sb/preview';

import { ListIcons } from './Icons.stories.fixture';

const meta = testingPreview.meta({
  title: 'Icons',
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

export const Decals = meta.story({
  args: {
    pattern: '*',
    type: 'decal',
  },
});
