import preview from '@sb/preview';

import { pageStoryMeta } from '../../../storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Assets/Board editor study',
  args: { path: '/assets/board-prototype?variant=A' },
});
export const CanvasAndInspector = meta.story({});
export const DrawThenAssign = meta.story({ args: { path: '/assets/board-prototype?variant=B' } });
export const TerritoryLedger = meta.story({ args: { path: '/assets/board-prototype?variant=C' } });
export const ArrakisRecreation = meta.story({ args: { path: '/assets/board-prototype?variant=A&fixture=arrakis' } });
