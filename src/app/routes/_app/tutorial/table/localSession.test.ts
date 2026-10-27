import type { PieceAction, ServerMessage } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from './localTable';

/* A tutorial table from the drafting checkpoint runs the session's own seating, draft, deal and trading. */
describe('a tutorial table before the deal', () => {
  let table: LocalTable;
  let sent: ServerMessage[];
  let count = 0;
  const start = () => startAt(setup as unknown as TutorialSetup, 'drafting', 'https://dune.zone');
  const act = (action: PieceAction | Record<string, unknown>, seat = table.seat) =>
    table.receive(
      {
        type: 'command',
        commandId: `command-${++count}`,
        action: action as PieceAction,
        expectedRevision: table.room.snapshot.revision,
      },
      seat
    );
  const stored = () => table.room.snapshot;
  const deal = () => start().draft!.deal;

  beforeEach(() => {
    table = new LocalTable(start());
    sent = [];
    table.deliver = (message) => sent.push(message);
  });

  afterEach(() => table.dispose());

  test('starts in the draft with every seat taken and no faction dealt', () => {
    expect(stored().stage).toBe('drafting');
    expect(table.seats()).toHaveLength(6);
    expect(stored().roster!.seats.every((seat) => seat.faction === null)).toBe(true);
  });

  test('deals the recorded factions once everyone has picked them and is ready', () => {
    for (const entry of deal()) {
      act({ kind: 'draft-pick', factionId: entry.factionId }, entry.seat);
    }
    for (const entry of deal()) {
      act({ kind: 'draft-ready', ready: true }, entry.seat);
    }
    expect(table.refusal).toBeUndefined();
    expect(stored().stage).toBe('swapping');
    const dealt = Object.fromEntries(stored().roster!.seats.map((seat) => [seat.id, seat.faction?.id]));
    expect(dealt).toEqual(Object.fromEntries(deal().map((entry) => [entry.seat, entry.factionId])));
    expect(stored().swapping?.tokens['seat-1']).toBe(deal().find((entry) => entry.seat === 'seat-1')!.token);
  });

  test('trades seats as the session does: an offer, then its acceptance moves the players, not the factions', () => {
    for (const entry of deal()) {
      act({ kind: 'draft-pick', factionId: entry.factionId }, entry.seat);
    }
    for (const entry of deal()) {
      act({ kind: 'draft-ready', ready: true }, entry.seat);
    }
    const round = stored().swapping!.round;
    const before = Object.fromEntries(stored().roster!.seats.map((seat) => [seat.id, seat.faction?.id]));
    act({ kind: 'swap-offer', round, seat: 'seat-1', target: 'seat-2' });
    const offer = stored().swapping!.offers[0]!;
    act({ kind: 'swap-accept', round: stored().swapping!.round, seat: 'seat-2', offerId: offer.id }, 'seat-2');
    expect(table.refusal).toBeUndefined();
    const after = Object.fromEntries(stored().roster!.seats.map((seat) => [seat.id, seat.faction?.id]));
    expect(after).toEqual(before);
    expect(table.seat).toBe('seat-2');
    expect(table.viewer('seat-1').userId).not.toBe(table.viewer('seat-2').userId);
  });

  test('seats a spectator once a player approves their request', () => {
    table.viewAs(SPECTATOR_SEAT);
    act({ kind: 'seat-request' }, SPECTATOR_SEAT);
    expect(table.refusal).toBeUndefined();
    const request = stored().controls!.seatRequests[0]!;
    act({ kind: 'seat-approve', requestId: request.id }, 'seat-1');
    expect(table.refusal).toBeUndefined();
    expect(table.seats()).toHaveLength(7);
  });
});
