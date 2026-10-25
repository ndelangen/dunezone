import { emptyBattlePlan } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { piece } from '@shared/play/setupSupply';
import { expect, test } from 'vite-plus/test';

import { planPieces } from './planView';

const card = (id: string, extra: Partial<TablePiece> = {}): TablePiece => ({
  ...piece(id, 'Card', 'house-harkonnen', '#000', 'card', 'cards:treachery'),
  items: [],
  ...extra,
});

test('a piece arranged on the private side-table can still be chosen for battle', () => {
  const arranged = card('arranged', { hiddenZone: { x: 0.5, y: 0.5 } });
  const pieces = planPieces({ ...emptyBattlePlan([]), pieces: [] }, [card('held'), arranged]);
  expect(pieces.map((entry) => entry.id)).toEqual(['held', 'arranged']);
});

test("the plan's own pieces join the hand once each", () => {
  const committed = card('committed');
  const pieces = planPieces({ ...emptyBattlePlan([]), pieces: [committed] }, [card('held'), committed]);
  expect(pieces.map((entry) => entry.id)).toEqual(['held', 'committed']);
});
