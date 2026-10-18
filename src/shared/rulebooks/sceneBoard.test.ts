import { expect, test } from 'vite-plus/test';

import { projectRulebookDraftRenderBlock } from './projectRenderDocument';

test('a scene on the maintained map draws its tints on the Arrakis board in the same frame', () => {
  const rendered = projectRulebookDraftRenderBlock(
    {
      kind: 'board-scene',
      id: 'scene',
      boardId: 'arrakis',
      caption: '',
      players: [],
      troops: [],
      highlights: [],
      annotations: [],
      tints: [{ id: 'tint', name: 'Spice', color: '#e8b923', territories: ['funeral_plain'] }],
    },
    {}
  );
  expect(rendered).toMatchObject({ kind: 'board-scene', tints: [{ id: 'tint', fills: [expect.any(Object)] }] });
});
