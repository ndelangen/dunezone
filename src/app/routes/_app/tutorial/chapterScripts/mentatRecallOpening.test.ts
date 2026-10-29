import { isBattleLeader } from '@shared/play/battle';
import { tableProgressFor } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { REVIEW_CHECKPOINTS } from '@shared/play/review';
import { expect, test } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from '../table/localTable';
import type { TablePlayers } from './chapterScript';
import { ATREIDES_BATTLE_LOSS_COUNTER } from './kwisatzHaderach';
import { mentatRecall } from './mentatRecall';

function practice() {
  const table = new LocalTable(
    startAt(setup as unknown as TutorialSetup, mentatRecall.checkpoint, 'https://dune.zone', mentatRecall)
  );
  let command = 0;
  const players: TablePlayers = {
    act: (seat, action) => {
      table.receive(
        { type: 'command', commandId: `lesson-${++command}`, expectedRevision: table.room.snapshot.revision, action },
        seat
      );
      expect(table.refusal, JSON.stringify(action)).toBeUndefined();
    },
    viewOf: (seat) => table.frame(seat).snapshot,
    others: () => table.seats().filter((seat) => seat !== table.seat),
    landings: () => table.landings(),
    captured: () => undefined,
    capturedPieces: () => [],
  };
  mentatRecall.opening!(players);
  return { table, players, view: () => table.frame().snapshot };
}

function startRecall({ table, players, view }: ReturnType<typeof practice>) {
  players.act(table.seat, { kind: 'review-propose', step: 0 });
  for (const seat of players.others()) {
    if (view().review?.startedAt === null) {
      players.act(seat, { kind: 'review-ballot', reviewId: view().review!.id, choice: 'review' });
    }
  }
}

function seek(game: ReturnType<typeof practice>, step: number) {
  game.players.act(game.table.seat, { kind: 'review-seek', reviewId: game.view().review!.id, step });
  return game.table.history(step).snapshot;
}

const counter = (snapshot: GameSnapshot) =>
  snapshot.hand!.find((piece) => piece.label === ATREIDES_BATTLE_LOSS_COUNTER.label)!.hiddenZone;
const treachery = (snapshot: GameSnapshot) =>
  snapshot.hand!.filter((piece) => piece.items.some((item) => item.artwork?.type === 'card-treachery')).length;
const leaders = (snapshot: GameSnapshot) =>
  snapshot.hand!.filter((piece) => !piece.hiddenZone && isBattleLeader(piece)).length;
const contents = (snapshot: GameSnapshot) => ({
  pieces: snapshot.table.pieces,
  storm: snapshot.table.stormSectorIndex,
  phase: snapshot.phase,
  hand: snapshot.hand,
  bank: snapshot.bank,
});

test('the practice history spans three turns and retains every teaching checkpoint', () => {
  const game = practice();
  try {
    const checkpoints = game.view().reviewCheckpoints!;
    expect(checkpoints).toHaveLength(24);
    expect(checkpoints.length).toBeLessThanOrEqual(REVIEW_CHECKPOINTS);
    expect(checkpoints[0]!.step).toBe(0);
    expect(new Set(checkpoints.map((checkpoint) => checkpoint.turn))).toEqual(new Set([1, 2, 3]));
    expect(checkpoints.filter((checkpoint) => checkpoint.moment === 'turn')).toHaveLength(4);
    expect(tableProgressFor(game.view().phase, game.view().phases)).toMatchObject({
      turn: 3,
      activePhaseId: 'spice-blow',
    });
  } finally {
    game.table.dispose();
  }
});

test('scrubbing changes the recorded hand, reserve, private tracker and public board', () => {
  const game = practice();
  try {
    const checkpoints = game.view().reviewCheckpoints!;
    const secondStorm = checkpoints.find((checkpoint) => checkpoint.turn === 2 && checkpoint.label === 'Storm')!;
    const movement = checkpoints.find(
      (checkpoint) => checkpoint.turn === 1 && checkpoint.faction === 'House Atreides'
    )!;
    startRecall(game);
    const first = game.table.history(0).snapshot;
    const middle = seek(game, secondStorm.step);
    const moved = seek(game, movement.step);
    const latest = seek(game, checkpoints.at(-1)!.step);
    expect([first.bank!.balance, middle.bank!.balance, latest.bank!.balance]).toEqual([10, 8, 6]);
    expect([treachery(first), treachery(middle), treachery(latest)]).toEqual([0, 1, 2]);
    expect(counter(first)).not.toEqual(counter(middle));
    expect(counter(middle)).not.toEqual(counter(latest));
    expect(first.table.stormSectorIndex).not.toBe(latest.table.stormSectorIndex);
    expect(leaders(moved)).toBe(4);
    expect(leaders(latest)).toBe(5);
    expect(latest.table.pieces.length).toBeGreaterThan(first.table.pieces.length);
  } finally {
    game.table.dispose();
  }
});

test('returning from the earliest checkpoint restores the unchanged live board and inventory', () => {
  const game = practice();
  try {
    const live = contents(game.view());
    startRecall(game);
    expect(game.table.history(0).snapshot.phase).not.toBe(live.phase);
    game.players.act(game.table.seat, { kind: 'review-end', reviewId: game.view().review!.id });
    expect(game.view().review).toBeNull();
    expect(contents(game.view())).toEqual(live);
  } finally {
    game.table.dispose();
  }
});
