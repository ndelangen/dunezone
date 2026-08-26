import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Groups',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Detail = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
});
export const Create = meta.story({ args: { path: '/groups/create' } });
export const Edit = meta.story({
  args: { path: '/groups/arrakeen-rules-council/edit' },
});
