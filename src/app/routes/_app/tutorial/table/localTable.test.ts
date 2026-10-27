import { capturedTokenStackKey } from '@shared/play/assetCapture';
import { storedSpawnContentsSchema } from '@shared/play/inventory';
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

  test('closes when the player determining the winner leaves their seat', () => {
    const opener = table.seats().find((seat) => seat !== table.seat)!;
    act({ kind: 'result-open' }, opener);
    expect(stored().ending?.by.seat).toBe(opener);
    act({ kind: 'seat-depart' }, opener);
    expect(table.refusal).toBeUndefined();
    expect(stored().ending).toBeNull();
  });

  test('closes when the player determining the winner is voted off the table', () => {
    const [opener, ...voters] = table.seats().filter((seat) => seat !== table.seat);
    act({ kind: 'result-open' }, opener);
    act({ kind: 'removal-start', seat: opener! });
    for (const voter of voters) {
      const open = table.frame().snapshot.removalVotes?.[0];
      if (open) {
        act({ kind: 'removal-ballot', voteId: open.id, choice: 'remove' }, voter);
      }
    }
    expect(table.seats()).not.toContain(opener);
    expect(stored().ending).toBeNull();
  });
});

/* A catalogue request commits with what the page's catalogue captured, as the Worker commits it after its capture. */
describe('a tutorial table’s catalogue request', () => {
  const contents = storedSpawnContentsSchema.parse({
    assetId: 'karama',
    name: 'Karama',
    type: 'token-disc',
    pieces: [
      {
        id: 'member-0',
        label: 'Karama',
        kind: 'force',
        owner: 'shared',
        inventory: 'shared',
        color: '#d5ba8c',
        accent: '#ead9bb',
        items: [
          {
            id: 'member-0-0',
            faceUp: true,
            artwork: {
              front: 'https://dune.zone/published/karama',
              back: 'https://dune.zone/published/karama',
              name: 'Karama',
              type: 'token-disc',
            },
          },
        ],
        stackKey: 'token:karama',
        position: [-25, 0, -25],
        orientation: 0,
        zoneId: null,
        locked: false,
      },
    ],
    members: [{ assetId: 'karama', count: 1 }],
    definitions: [],
  });

  test('waits for another player’s approval, then adds the piece to the Shared table inventory', () => {
    const table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    table.requestSpawn(
      {
        type: 'command',
        commandId: 'request',
        action: { kind: 'spawn-request', type: 'token-disc', slug: 'karama' },
        expectedRevision: table.room.snapshot.revision,
      },
      contents
    );
    const [request] = table.room.snapshot.controls!.requests;
    expect(request).toMatchObject({ requesterSeat: table.seat, contents: { name: 'Karama' } });
    const command = (seat: string) =>
      table.receive(
        {
          type: 'command',
          commandId: `approve-${seat}`,
          action: { kind: 'spawn-approve', requestId: request!.id },
          expectedRevision: table.room.snapshot.revision,
        },
        seat
      );
    command(table.seat);
    expect(table.refusal).toBe('One different seated player must approve this request.');
    command(table.seats().find((seat) => seat !== table.seat)!);
    expect(table.room.snapshot.controls!.requests).toEqual([]);
    expect(table.room.snapshot.table.pieces.filter((piece) => piece.label === 'Karama')).toMatchObject([
      { inventory: 'shared', items: [{ faceUp: true }] },
    ]);
    /* The guide follows Karama by the asset its selection captured, and the page sees the pieces under that asset's stack key. */
    expect(table.capturedAsset({ type: 'token-disc', slug: 'karama' })).toBe('karama');
    expect(table.capturedAsset({ type: 'bundle', slug: 'karama' })).toBeUndefined();
    expect(
      table.frame().snapshot.table.pieces.filter((piece) => piece.stackKey === capturedTokenStackKey('karama'))
    ).toHaveLength(1);
    table.dispose();
  });
});

/* A removal vote runs on the session's own rules: more than half of the whole table, the player voted on included, must vote yes. */
describe('a tutorial table’s removal vote', () => {
  let table: LocalTable;
  let count = 0;
  const act = (action: PieceAction, seat = table.seat) =>
    table.receive(
      { type: 'command', commandId: `vote-${++count}`, action, expectedRevision: table.room.snapshot.revision },
      seat
    );
  const vote = () => table.frame().snapshot.removalVotes?.[0];

  beforeEach(() => {
    table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
  });

  afterEach(() => table.dispose());

  test('removes the player once four of the six vote yes, and their seat leaves the table', () => {
    const [target, ...voters] = table.seats().filter((seat) => seat !== table.seat);
    act({ kind: 'removal-start', seat: target! });
    expect(vote()).toMatchObject({ target: { seat: target }, threshold: 4 });
    expect(vote()!.ballots.find((ballot) => ballot.seat === table.seat)?.choice).toBe('remove');
    act({ kind: 'removal-ballot', voteId: vote()!.id, choice: 'remove' }, voters[0]);
    act({ kind: 'removal-ballot', voteId: vote()!.id, choice: 'keep' }, voters[1]);
    expect(vote()).toBeDefined();
    act({ kind: 'removal-ballot', voteId: vote()!.id, choice: 'remove' }, voters[2]);
    expect(vote()!.ballots.filter((ballot) => ballot.choice === 'remove')).toHaveLength(3);
    act({ kind: 'removal-ballot', voteId: vote()!.id, choice: 'remove' }, voters[3]);
    expect(table.refusal).toBeUndefined();
    expect(vote()).toBeUndefined();
    expect(table.seats()).not.toContain(target);
    /* The seat it vacates shows as open, so a spectator can ask for it. */
    expect(table.frame().snapshot.controls?.seats).not.toContain(target);
  });

  test('keeps the page on the seat it views as, and moves it off a seat the vote empties', () => {
    const [target, viewed, ...voters] = table.seats().filter((seat) => seat !== table.seat);
    const learner = table.seat;
    table.viewAs(viewed!);
    act({ kind: 'removal-start', seat: target! });
    expect(table.seat).toBe(viewed);
    for (const voter of [learner, ...voters].filter((seat) => seat !== table.seat)) {
      const open = vote();
      if (open) {
        act({ kind: 'removal-ballot', voteId: open.id, choice: 'remove' }, voter);
      }
    }
    expect(table.seats()).not.toContain(target);
    expect(table.seat).toBe(viewed);
    table.viewAs(learner);
    act({ kind: 'removal-start', seat: viewed! });
    table.viewAs(viewed!);
    expect(table.seat).toBe(viewed);
    for (const voter of [learner, ...voters].filter((seat) => seat !== table.seat)) {
      const open = vote();
      if (open) {
        act({ kind: 'removal-ballot', voteId: open.id, choice: 'remove' }, voter);
      }
    }
    expect(table.seats()).not.toContain(viewed);
    expect(table.seat).toBe(learner);
  });

  test('lapses when the player voted on leaves their seat', () => {
    const [target] = table.seats().filter((seat) => seat !== table.seat);
    act({ kind: 'removal-start', seat: target! });
    expect(vote()).toBeDefined();
    act({ kind: 'seat-depart' }, target);
    expect(table.refusal).toBeUndefined();
    expect(table.seats()).not.toContain(target);
    expect(vote()).toBeUndefined();
  });

  /* A stack a seat picks up, held while the seat changes hands. */
  const pickUp = (seat: string) => {
    const piece = table
      .frame(seat)
      .snapshot.table.pieces.find((entry) => entry.kind === 'force' && !entry.inventory && !entry.locked)!;
    table.receive(
      {
        type: 'begin',
        carryId: `carry-${++count}`,
        sourcePieceId: piece.id,
        expectedVersion: table.frame(seat).snapshot.versions[piece.id] ?? 0,
        pickup: 'whole',
      },
      seat
    );
    expect(table.room.carries.size).toBe(1);
    expect(table.room.reservations.size).toBe(1);
  };
  const releasedAll = () => {
    expect(table.room.carries.size).toBe(0);
    expect(table.room.reservations.size).toBe(0);
  };

  test('lets go of what a player carries as they leave their seat', () => {
    const [leaver] = table.seats().filter((seat) => seat !== table.seat);
    pickUp(leaver!);
    act({ kind: 'seat-depart' }, leaver);
    expect(table.refusal).toBeUndefined();
    releasedAll();
  });

  test('lets go of what a player carries as they are voted off the table', () => {
    const [target, ...voters] = table.seats().filter((seat) => seat !== table.seat);
    pickUp(target!);
    act({ kind: 'removal-start', seat: target! });
    for (const voter of voters) {
      const open = vote();
      if (open) {
        act({ kind: 'removal-ballot', voteId: open.id, choice: 'remove' }, voter);
      }
    }
    expect(table.seats()).not.toContain(target);
    releasedAll();
  });

  test('fails as soon as enough players keep them that four yes votes cannot be reached', () => {
    const [target, ...voters] = table.seats().filter((seat) => seat !== table.seat);
    act({ kind: 'removal-start', seat: target! });
    act({ kind: 'removal-ballot', voteId: vote()!.id, choice: 'keep' }, voters[0]);
    act({ kind: 'removal-ballot', voteId: vote()!.id, choice: 'keep' }, voters[1]);
    expect(vote()).toBeUndefined();
    expect(table.seats()).toContain(target);
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
