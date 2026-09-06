import preview from '@sb/preview';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Preview',
  ...pageStoryMeta,
});

export const FactionSheet = meta.story({
  args: { path: '/preview/sheet/house-atreides?mode=db' },
  globals: { viewport: { value: 'page' } },
});

export const LiveFactionSheet = meta.story({
  args: { path: '/preview/sheet/live-preview?mode=live' },
  globals: { viewport: { value: 'page' } },
});
