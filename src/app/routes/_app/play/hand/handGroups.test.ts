import type { TablePiece } from '@shared/play/model';
import { expect, test } from 'vite-plus/test';

import { handGroups } from './handGroups';

const piece = (
  id: string,
  kind: TablePiece['kind'],
  backName?: string,
  stackKey: string | null = null
): TablePiece => ({
  id,
  label: id,
  owner: 'house-atreides',
  color: '#000000',
  accent: '#000000',
  items: [{ id: `${id}-item`, faceUp: false, artwork: { back: 'https://dune.zone/back.jpg', backName, type: 'card' } }],
  stackKey,
  position: [0, 0, 0],
  orientation: 0,
  zoneId: null,
  locked: false,
  kind,
});

test('leaders come first, then each card back by name, then tokens', () => {
  const leader = {
    ...piece('jessica', 'force'),
    items: [
      { id: 'jessica-item', faceUp: true, artwork: { back: 'https://dune.zone/disc.png', type: 'token-leader' } },
    ],
  };
  const groups = handGroups([
    piece('snooper', 'card', 'Treachery'),
    piece('marker', 'marker'),
    piece('bewt', 'card', 'Traitor'),
    leader,
    piece('shield', 'card', 'Treachery'),
  ]);
  expect(groups.map((group) => [group.label, group.pieces.map((entry) => entry.id)])).toEqual([
    ['Leaders', ['jessica']],
    ['Traitor', ['bewt']],
    ['Treachery', ['snooper', 'shield']],
    ['Tokens', ['marker']],
  ]);
});
