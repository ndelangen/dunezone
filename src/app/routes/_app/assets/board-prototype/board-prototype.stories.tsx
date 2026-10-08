import preview from '@sb/preview';

import { pageStoryMeta } from '../../../storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Assets/Board editor study',
  args: { path: '/assets/board-prototype' },
});
export const CanvasAndInspector = meta.story({});
export const ArrakisRecreation = meta.story({ args: { path: '/assets/board-prototype?fixture=arrakis' } });

export const BlankBoard = meta.story({ args: { path: '/assets/board-prototype?fixture=blank' } });
