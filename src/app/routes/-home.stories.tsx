import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Home',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
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
