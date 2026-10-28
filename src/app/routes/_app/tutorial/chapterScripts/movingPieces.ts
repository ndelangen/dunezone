import { factionTokenOf } from '@shared/play/factionToken';
import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, grownCarryLanded, holdsAll, onBoard, task } from './guideChecks';
import type { Piece } from './guideChecks';

/* Moving one troop comes first, then holding a stack, splitting it and combining pieces. */

/*
 * A piece changed where it lies, by id: turning and flipping leave a piece in place under the same id.
 * A stack that joins another during the task goes on under the other's id, so a piece first seen then is taken as it is, to compare against from there.
 */
const changedInPlace = (stacks: () => Piece[], changed: (before: Piece, now: Piece) => boolean) => ({
  begin: () => new Map(stacks().map((piece) => [piece.id, piece])),
  done: (start: Map<string, Piece>) =>
    stacks().some((piece) => {
      const before = start.get(piece.id);
      if (before === undefined) {
        start.set(piece.id, piece);
        return false;
      }
      return changed(before, piece);
    }),
});

const biggest = (stacks: Piece[]) => stacks.toSorted((a, b) => b.items.length - a.items.length)[0];

/* Where the player's troops are: in their reserves on the rim, or on the board. */
function troops(snapshot: () => GameSnapshot) {
  const mine = () =>
    snapshot().table.pieces.filter(
      (piece) => !piece.inventory && piece.stackKey?.startsWith(`troops:${snapshot().bank?.factionId}:`)
    );
  return { reserves: () => mine().filter((piece) => !onBoard(piece)), onTheBoard: () => mine().filter(onBoard) };
}

/*
 * The three carried onto the board, followed by their troops: the table hands troops out under their own ids, which a move
 * or a join keeps, so the stack holding them is the player's wherever it goes, and a troop of theirs already on the board never is.
 */
function carriedStack(onTheBoard: () => Piece[]) {
  const landed = { troops: new Set<string>() };
  const carried = () =>
    landed.troops.size
      ? onTheBoard().find((piece) => piece.items.some((item) => landed.troops.has(item.id)))
      : biggest(onTheBoard());
  return {
    carried,
    only: () => onTheBoard().filter((piece) => piece === carried()),
    land: (stack: Piece) => {
      landed.troops = new Set(stack.items.map((item) => item.id));
    },
  };
}

/* The player's own troops: split off the reserves, carried whole onto the board, joined, turned and flipped. */
function stackTasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const { reserves, onTheBoard } = troops(snapshot);
  const { carried, only: carriedOnly, land } = carriedStack(onTheBoard);
  /*
   * The biggest of the player's reserve stacks, where a split comes from, and the three split off it: a stack of exactly three,
   * so a pair split off first is never taken for them, or the smallest of two or more while there is none.
   */
  const biggestReserve = () => biggest(reserves());
  const splitStack = () =>
    reserves().find((piece) => piece.items.length === 3) ??
    reserves()
      .filter((piece) => piece.items.length > 1)
      .toSorted((a, b) => a.items.length - b.items.length)[0];
  return [
    task({
      id: 'move-one',
      task: 'Move one troop',
      detail:
        'Quickly drag a troop from your reserves onto an empty part of the board. A quick drag picks up just the top piece.',
      anchor: { kind: 'table', point: () => at(biggestReserve()) },
      begin: () => ({
        seen: players.landings().length,
        ids: new Set(reserves().flatMap((piece) => piece.items.map((item) => item.id))),
      }),
      done: ({ seen, ids }) =>
        players
          .landings()
          .slice(seen)
          .some(
            (landing) =>
              landing.itemIds.length === 1 &&
              ids.has(landing.itemIds[0]!) &&
              onTheBoard().some((piece) => holdsAll(piece, new Set(landing.itemIds)))
          ),
    }),
    task({
      id: 'carry-reserves',
      task: 'Move a whole stack',
      detail:
        'Press and hold your reserve stack for a moment, then drag it a short distance along the rim and let go. The hold picks up the whole stack. Keep it beside your seat for the next exercise.',
      anchor: { kind: 'table', point: () => at(biggestReserve()) },
      begin: () => ({
        seen: players.landings().length,
        ids: new Set(biggestReserve()?.items.map((item) => item.id)),
        position: biggestReserve()?.position.join(),
      }),
      done: ({ seen, ids, position }) =>
        ids.size > 1 &&
        players
          .landings()
          .slice(seen)
          .some((landing) => [...ids].every((id) => landing.itemIds.includes(id))) &&
        reserves().some((piece) => holdsAll(piece, ids) && piece.position.join() !== position),
    }),
    task({
      id: 'split',
      task: 'Split three troops off',
      detail:
        'Point at your reserves, on the rim at your seat, and hold {3} on your keyboard for a second. Three troops slide off beside them.',
      anchor: { kind: 'table', point: () => at(biggestReserve()) },
      begin: () => reserves().filter((piece) => piece.items.length === 3).length,
      done: (start) => reserves().filter((piece) => piece.items.length === 3).length > start,
    }),
    task({
      id: 'carry-stack',
      task: 'Carry all three at once',
      detail:
        'A quick drag takes only the top troop. Press and hold on the three for a moment, then drag them onto a territory.',
      anchor: { kind: 'table', point: () => at(splitStack()) },
      /*
       * The three keep their ids on the move: the step is done once one carry set all three down together and a stack on the board
       * holds them. A single troop dragged off the top never does, nor the three dropped one by one, nor the whole reserves carried
       * instead; a troop or two taken along with {T} still counts.
       */
      begin: () => ({ three: new Set(splitStack()?.items.map((item) => item.id)), seen: players.landings().length }),
      done: ({ three, seen }) => {
        const together = players
          .landings()
          .slice(seen)
          .some((landing) => three.size > 0 && [...three].every((id) => landing.itemIds.includes(id)));
        const stack = together ? onTheBoard().find((piece) => holdsAll(piece, three)) : undefined;
        if (stack) {
          land(stack);
        }
        return stack !== undefined;
      },
    }),
    task({
      id: 'take-more',
      task: 'Take a few more',
      detail:
        'Quickly drag one troop off your reserves and keep holding it over them. Press {T}, or right-click, once for each troop to add: they join the one you carry. Then drop them all on a territory.',
      anchor: { kind: 'table', point: () => at(biggestReserve()) },
      ...grownCarryLanded(players.landings, onTheBoard),
    }),
    task({
      id: 'join',
      task: 'Add a troop to them',
      detail: 'Quickly drag one troop from your reserves and let go right on top of your three. It joins their stack.',
      anchor: { kind: 'table', point: () => at(carried()) },
      begin: () => carried()?.items.length ?? 0,
      done: (start) => (carried()?.items.length ?? 0) > start,
    }),
    task({
      id: 'turn',
      task: 'Turn your stack',
      detail: 'Point at your troops on the board and press {Q} or {E} on your keyboard. Each press turns them a step.',
      anchor: { kind: 'table', point: () => at(carried()) },
      ...changedInPlace(carriedOnly, (before, now) => before.orientation !== now.orientation),
    }),
    task({
      id: 'flip',
      task: 'Flip the whole stack',
      detail: 'Still pointing at them, press {F}. A stack turns over all at once, as a single card does.',
      anchor: { kind: 'table', point: () => at(carried()) },
      ...changedInPlace(carriedOnly, (before, now) => (now.flipRevision ?? 0) > (before.flipRevision ?? 0)),
    }),
  ];
}

/* The player's faction token on the ring: carried to another sector, then flipped face down. */
function tokenTasks(snapshot: () => GameSnapshot): GuideTask[] {
  const token = () => factionTokenOf(snapshot().table.pieces, snapshot().bank?.factionId ?? '');
  return [
    task({
      id: 'token-move',
      task: 'Move your faction token',
      detail:
        'Your faction token stands on the rim at your seat and marks your place in storm order. Drag it: it slides along the rim and settles in the sector you let go over.',
      anchor: { kind: 'table', point: () => at(token()) },
      begin: () => token()?.position.join(),
      done: (start) => token() !== undefined && token()!.position.join() !== start,
    }),
    task({
      id: 'token-flip',
      task: 'Flip your faction token',
      detail:
        'Point at your token and press {F}. Face down, it tells the table you sit something out, such as a round of bidding. {F} again turns it back.',
      anchor: { kind: 'table', point: () => at(token()) },
      begin: () => token()?.flipRevision ?? 0,
      done: (start) => (token()?.flipRevision ?? 0) > start,
    }),
  ];
}

const tasks = (snapshot: () => GameSnapshot, players: TablePlayers) => [
  ...stackTasks(snapshot, players),
  ...tokenTasks(snapshot),
];

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'A quick drag moves one piece',
  'Press and hold before dragging to carry a whole stack',
  'Hold a number key over a stack to split that many off',
  'While carrying, {T} or a right-click over the stack takes one more',
  'Drop a piece on its own kind to join the stack',
  '{Q} and {E} turn a piece, {F} flips a whole stack',
  'Your faction token slides along the rim, and {F} turns it face down to sit out',
];

export const movingPieces: ChapterScript = { slug: 'moving-pieces', checkpoint: 'turn-1-storm', tasks, learned };
