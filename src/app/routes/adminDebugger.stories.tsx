import preview from '@sb/preview';

import { openReport } from './adminDebugger.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Admin/Game debugger',
  ...pageStoryMeta,
  args: { path: '/admin/game-debugger' },
});

export const Empty = meta.story({});
export const Report = meta.story({
  play: async ({ canvasElement }) => {
    await openReport(canvasElement);
  },
});
