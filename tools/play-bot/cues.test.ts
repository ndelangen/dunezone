import { expect, it } from 'vite-plus/test';

import { cuesFor } from './cues';
import { BotView } from './view';

const roster = {
  seatCount: 2,
  seats: [
    { id: 'seat-1', position: 0, faction: { id: 'fremen', name: 'Fremen' } },
    { id: 'seat-2', position: 1, faction: { id: 'emperor', name: 'Emperor' } },
  ],
};

function viewOf(snapshot: Record<string, unknown>, seat = 'seat-1') {
  const view = new BotView();
  view.current = {
    viewer: { viewerSeat: seat },
    snapshot: { phase: 0, stage: 'play', roster, table: { stormSectorIndex: 0, pieces: [] }, controls: { ready: [] }, ...snapshot },
  } as unknown as BotView['current'];
  return view;
}

it('calls on the faction at setup until its seat is ready, and not for another faction\'s step', () => {
  const setup = { index: 0, steps: [{ title: 'Traitors', kind: 'traitors' }, { title: 'Bene Gesserit prediction', factionId: 'bene-gesserit' }] };
  expect(cuesFor(viewOf({ stage: 'setup', setup }), 0).map((cue) => cue.key)).toEqual(['setup:0']);
  expect(cuesFor(viewOf({ stage: 'setup', setup, controls: { ready: ['seat-1'] } }), 0)).toEqual([]);
  expect(cuesFor(viewOf({ stage: 'setup', setup: { ...setup, index: 1 } }), 0)).toEqual([]);
});

it('calls on the bidder whose turn it is, again after each raise', () => {
  const bidding = { stage: 'open', round: 2, turn: 'fremen', bid: { factionId: 'emperor', amount: 3 }, passed: [] };
  const [cue] = cuesFor(viewOf({ phase: 3, bidding }), 1);
  expect(cue?.reason).toBe('Your turn to bid on card 2 (Emperor bids 3).');
  expect(cuesFor(viewOf({ phase: 3, bidding: { ...bidding, turn: 'emperor' } }), 1)).toEqual([]);
  expect(cuesFor(viewOf({ phase: 3, bidding: { ...bidding, bid: { factionId: 'emperor', amount: 5 } } }), 1)[0]?.key).not.toBe(cue?.key);
});

it('calls on Revival once a turn and on a battle where the faction is a side', () => {
  expect(cuesFor(viewOf({ phase: 4 }), 2).map((cue) => cue.key)).toEqual(['revival:2']);
  const battle = {
    id: 'b1',
    territory: 'Arrakeen',
    stage: 'preparing',
    sides: [
      { factionId: 'emperor', ready: false, choice: null },
      { factionId: 'fremen', ready: false, choice: null },
    ],
  };
  expect(cuesFor(viewOf({ phase: 6, battle }), 2)).toEqual([
    { key: 'battle:b1', reason: 'A battle in Arrakeen against Emperor: plan it.' },
  ]);
  expect(cuesFor(viewOf({ phase: 6, battle: { ...battle, sides: [battle.sides[0], { factionId: 'harkonnen', ready: false, choice: null }] } }), 2)).toEqual([]);
});

it('calls on the faction whose turn it is in Shipment and Movement', () => {
  const movement = { done: [], order: ['emperor', 'fremen'] };
  expect(cuesFor(viewOf({ phase: 5, movement }), 1)).toEqual([]);
  expect(cuesFor(viewOf({ phase: 5, movement: { ...movement, done: ['emperor'] } }), 1).map((cue) => cue.key)).toEqual(['move:1']);
});
