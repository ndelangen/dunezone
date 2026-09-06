import preview from '@sb/preview';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Home',
  ...pageStoryMeta,
});

export const Default = meta.story({
  beforeEach: () => {
    const random = Math.random;
    Math.random = () => 0;
    return () => {
      Math.random = random;
    };
  },
});
