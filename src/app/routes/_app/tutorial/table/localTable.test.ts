import type { PieceAction, ServerMessage } from '@shared/play/protocol';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from './localTable';

/* Determine winner and its result change only the stored state, so a tutorial table runs them as the session does. */
describe('a tutorial table’s result', () => {
  let table: LocalTable;
  let sent: ServerMessage[];
  let count = 0;
  const act = (action: PieceAction, seat = table.seat) =>
    table.receive(
      { type: 'command', commandId: `command-${++count}`, action, expectedRevision: table.room.snapshot.revision },
      seat
    );
  const stored = () => table.room.snapshot;

  beforeEach(() => {
    table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    sent = [];
    table.deliver = (message) => sent.push(message);
    /* The Mentat Pause is the turn's ninth phase. */
    for (let step = 0; step < 8; step++) {
      act({ kind: 'phase' });
    }
  });

  afterEach(() => table.dispose());

  test('declares a winner and continues the game from the Mentat Pause', () => {
    const winner = stored().roster!.seats.find((entry) => entry.faction)!.faction!.id;
    act({ kind: 'result-open' });
    expect(stored().ending?.by.seat).toBe(table.seat);
    act({ kind: 'result-declare', result: 'faction', factionIds: [winner] });
    expect(stored()).toMatchObject({
      stage: 'finished',
      ending: null,
      result: { kind: 'faction', factionIds: [winner] },
    });
    act({ kind: 'result-continue' });
    expect(stored()).toMatchObject({ stage: 'play', result: null });
    expect(table.refusal).toBeUndefined();
  });

  test('refuses a declaration from a player who did not open it, as the session does', () => {
    const other = table.seats().find((seat) => seat !== table.seat)!;
    act({ kind: 'result-open' });
    act({ kind: 'result-declare', result: 'none', factionIds: [] }, other);
    expect(table.refusal).toBe('Only the player determining the winner can do that.');
    expect(stored().stage).toBe('play');
  });

  test('holds the Mentat Pause while the winner is being determined', () => {
    act({ kind: 'result-open' });
    act({ kind: 'phase' });
    expect(table.refusal).toMatch(/winner is being determined/);
    expect(stored().ending?.by.seat).toBe(table.seat);
  });

  test('still refuses what only a game’s session runs', () => {
    act({ kind: 'removal-start', seat: table.seats().find((seat) => seat !== table.seat)! });
    expect(table.refusal).toMatch(/need a real game/);
    expect(sent.at(-1)).toMatchObject({ type: 'view' });
  });
});

/* The guide reads what the learner's carries did from the table's record, so a gesture faster than its tick still counts. */
describe('a tutorial table’s landings', () => {
  let table: LocalTable;
  let count = 0;
  const send = (message: Parameters<LocalTable['receive']>[0]) => table.receive(message, table.seat);
  type Piece = ReturnType<LocalTable['frame']>['snapshot']['table']['pieces'][number];
  /* A stack of three or more lying loose on the table, to carry from: troops, or a deck of cards when `kind` says so. */
  const source = (kind: Piece['kind'] = 'force') =>
    table
      .frame()
      .snapshot.table.pieces.find(
        (piece) => piece.kind === kind && !piece.inventory && !piece.locked && piece.items.length >= 3
      )!;
  /* Whether one stack the page sees holds every item of the landing, by the ids the page sees. */
  const landedTogether = (itemIds: readonly string[]) =>
    table
      .frame()
      .snapshot.table.pieces.some((piece) => itemIds.every((id) => piece.items.some((item) => item.id === id)));
  const carry = (pickup: 'top' | 'whole', takes: number, kind?: Piece['kind']) => {
    const piece = source(kind);
    const carryId = `carry-${++count}`;
    send({
      type: 'begin',
      carryId,
      sourcePieceId: piece.id,
      expectedVersion: table.frame().snapshot.versions[piece.id] ?? 0,
      pickup,
    });
    for (let take = 0; take < takes; take++) {
      send({ type: 'take', requestId: `take-${++count}`, carryId, donorPieceId: piece.id });
    }
    send({
      type: 'drop',
      commandId: `drop-${++count}`,
      carryId,
      position: [piece.position[0] + 0.3, piece.position[1], piece.position[2] + 0.3],
      orientation: piece.orientation,
    });
    return piece;
  };

  beforeEach(() => {
    table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    table.deliver = () => {};
  });

  afterEach(() => table.dispose());

  test('records a carry that grew with a take, and the items it set down', () => {
    carry('top', 1);
    expect(table.refusal).toBeUndefined();
    const [landing] = table.landings();
    expect(table.landings()).toHaveLength(1);
    expect(landing).toMatchObject({ grew: true, itemIds: expect.any(Array) });
    expect(landing!.itemIds).toHaveLength(2);
    expect(landedTogether(landing!.itemIds)).toBe(true);
  });

  test('names the cards of a carry by the ids the page sees, which hide the cards’ own', () => {
    carry('top', 1, 'card');
    const [landing] = table.landings();
    expect(table.refusal).toBeUndefined();
    expect(landing).toMatchObject({ grew: true });
    expect(landing!.itemIds).toHaveLength(2);
    expect(landedTogether(landing!.itemIds)).toBe(true);
  });

  test('records a stack picked up whole as a carry that did not grow', () => {
    const piece = carry('whole', 0);
    expect(table.landings()).toEqual([{ itemIds: piece.items.map((item) => item.id), grew: false }]);
  });
});
