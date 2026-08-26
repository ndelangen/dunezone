import preview from '@sb/preview';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Groups',
  ...pageStoryMeta,
});

export const Detail = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
});
export const Create = meta.story({ args: { path: '/groups/create' } });
export const Edit = meta.story({
  args: { path: '/groups/arrakeen-rules-council/edit' },
});
