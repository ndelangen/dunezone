import { db } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from './storybook';

export const pageStoryMeta = {
  component: StorybookPage,
  args: { path: '/' },
  beforeEach: syncPreviewFrameHash,
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    database: db((baseline) => baseline),
  },
};
