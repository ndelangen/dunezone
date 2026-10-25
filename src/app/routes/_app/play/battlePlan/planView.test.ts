import { emptyBattlePlan } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { piece } from '@shared/play/setupSupply';
import { expect, test } from 'vite-plus/test';

import { arranged, cardsOf, planPieces, seated, toggleIn, toggleLeader } from './planView';

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

test('a leader joins the ones already in the plan, and a second click takes only that one out', () => {
  const plan = { ...emptyBattlePlan([]), pieces: [], leaderIds: ['stilgar'] };
  expect(toggleLeader(plan, 'chani')).toEqual({ leaderIds: ['stilgar', 'chani'] });
  expect(toggleLeader({ ...plan, leaderIds: ['stilgar', 'chani'] }, 'stilgar')).toEqual({ leaderIds: ['chani'] });
});

test('a Traitor card stays out of the picker, unless an older plan already holds it and it has to come out', () => {
  const traitor = (id: string) =>
    card(id, {
      items: [
        { id: `${id}-item`, faceUp: true, artwork: { front: 'f', back: 'b', name: 'Traitor', type: 'card-traitor' } },
      ],
    });
  const pieces = [card('treachery', { items: [{ id: 't', faceUp: true }] }), traitor('loose'), traitor('kept')];
  expect(cardsOf(pieces, []).map((entry) => entry.id)).toEqual(['treachery']);
  expect(cardsOf(pieces, ['kept']).map((entry) => entry.id)).toEqual(['treachery', 'kept']);
});

test("choosing a piece keeps the strip's order, and the plan takes the chosen ones in that order", () => {
  const order = ['crysknife', 'shield', 'chaumas'];
  expect(toggleIn(['chaumas'], 'crysknife', order)).toEqual(['crysknife', 'chaumas']);
  expect(toggleIn(['crysknife', 'chaumas'], 'crysknife', order)).toEqual(['chaumas']);
});

test("the player's order holds as pieces come and go, and a reload seats the plan's own order", () => {
  expect(arranged(['b', 'a', 'gone'], ['a', 'b', 'new'])).toEqual(['b', 'a', 'new']);
  expect(seated(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b']);
});
