import { db } from '@db/storybook';

import { StorybookPage } from './-storybook';

export const pageStoryMeta = {
  component: StorybookPage,
  args: { path: '/' },
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    database: db((baseline) => baseline),
  },
};
