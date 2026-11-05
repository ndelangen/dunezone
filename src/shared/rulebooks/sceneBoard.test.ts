import { expect, test } from 'vite-plus/test';

import { arrakisBoardCapture } from '../play/fixtures/board';
import { ARRAKIS_OFFICIAL } from './fixtures/arrakisOfficial';
import { projectRulebookDraftRenderBlock } from './projectRenderDocument';

const scene = (boardId: string) => ({
  kind: 'board-scene' as const,
  id: 'scene',
  boardId,
  caption: '',
  players: [],
  troops: [],
  highlights: [],
  annotations: [],
  tints: [{ id: 'tint', name: 'Spice', color: '#e8b923', territories: ['funeral_plain'] }],
});

test('a scene draws its tints on its board, in the frame its image fills', () => {
  const rendered = projectRulebookDraftRenderBlock(scene(ARRAKIS_OFFICIAL.id), {
    [ARRAKIS_OFFICIAL.id]: {
      assetId: ARRAKIS_OFFICIAL.id,
      name: ARRAKIS_OFFICIAL.name,
      type: 'board',
      imageUrl: ARRAKIS_OFFICIAL.imageUrl,
      geometry: ARRAKIS_OFFICIAL.geometry,
      publicationRevision: ARRAKIS_OFFICIAL.revision,
      board: arrakisBoardCapture.definition,
    },
  });
  expect(rendered).toMatchObject({ kind: 'board-scene', tints: [{ id: 'tint', fills: [expect.any(Object)] }] });
});

test('a scene whose board has not resolved draws no tints', () => {
  expect(projectRulebookDraftRenderBlock(scene('gone'), {})).not.toHaveProperty('tints.0.fills.0');
});
