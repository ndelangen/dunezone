import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { at, element, onBoard, tableDeck, task } from './guideChecks';
import type { Piece } from './guideChecks';

/*
 * Chapter 7, "Moving pieces": the hands-on controls chapter 5 only touched, on the same table.
 * A stack split with a number key, carried whole, joined, turned and flipped; then a deck shuffled and peeked at.
 * Taking more with T, locking, dealing and splitting cards off a deck with a number key wait for a later chapter.
 */

/*
 * The cards of a deck held open by a peek, by the handles the peek shows them under, top first; null while no deck is open.
 * Handles rather than names, since a deck holds several cards of one name.
 */
const peekedOrder = () => {
  const row = document.querySelector('[role="dialog"][aria-label^="Peeking at"] ol');
  return row ? [...row.querySelectorAll('[data-card]')].map((card) => card.getAttribute('data-card') ?? '') : null;
};

/*
 * Moving a card in a deck held open gives every card a new handle, so nobody else can follow it, and the peek stays open.
 * Anything else that changes the deck's handles closes the peek, as a shuffle or a draw does, and pulling a card out changes its size.
 * So the task waits for the deck to open, then counts a change of handles at the same size while it stays open;
 * a peek that closes starts over from the order it shows when it opens again.
 */
const movedInPeek = () => ({
  begin: () => ({ first: null as string[] | null }),
  done: (watch: { first: string[] | null }) => {
    const order = peekedOrder();
    if (!order || watch.first?.length !== order.length) {
      watch.first = order;
      return false;
    }
    return watch.first.some((card, index) => card !== order[index]);
  },
});

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

const total = (stacks: Piece[]) => stacks.reduce((sum, piece) => sum + piece.items.length, 0);
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
    land: () => {
      landed.troops = new Set(biggest(onTheBoard())?.items.map((item) => item.id));
    },
  };
}

/* The player's own troops: split off the reserves, carried whole onto the board, joined, turned and flipped. */
function stackTasks(snapshot: () => GameSnapshot): GuideTask[] {
  const { reserves, onTheBoard } = troops(snapshot);
  const { carried, only: carriedOnly, land } = carriedStack(onTheBoard);
  /* The biggest of the player's reserve stacks, where a split comes from, and the smallest of two or more, where it went. */
  const biggestReserve = () => biggest(reserves());
  const splitStack = () =>
    reserves()
      .filter((piece) => piece.items.length > 1)
      .toSorted((a, b) => a.items.length - b.items.length)[0];
  return [
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
       * A whole stack lands on the board in one go, so the troops there jump by two or more from one frame to the next;
       * single troops dropped one after another never do.
       */
      begin: () => ({ last: total(onTheBoard()) }),
      done: (watch) => {
        const now = total(onTheBoard());
        const jumped = now - watch.last >= 2;
        watch.last = now;
        if (jumped) {
          land();
        }
        return jumped;
      },
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

/* The Spice deck: shuffled, then peeked at and one card moved. */
function deckTasks(snapshot: () => GameSnapshot): GuideTask[] {
  const spiceDeck = () => tableDeck(snapshot, 'right');
  return [
    task({
      id: 'shuffle',
      task: 'Shuffle the Spice deck',
      detail: 'Point at the Spice deck on the right of the table and press {R} on your keyboard.',
      anchor: { kind: 'table', point: () => at(spiceDeck()) },
      begin: () => spiceDeck()?.shuffleRevision ?? 0,
      done: (start) => (spiceDeck()?.shuffleRevision ?? 0) > start,
    }),
    task({
      id: 'peek',
      task: 'Peek at the Spice deck',
      detail:
        'Right-click the Spice deck and choose Peek at the deck. Only you see its cards, though the others see that you looked.',
      anchor: { kind: 'table', point: () => at(spiceDeck()) },
      begin: () => undefined,
      done: () => peekedOrder() !== null,
    }),
    task({
      id: 'reorder',
      task: 'Move a card in the deck',
      detail:
        'Drag a card along the row to a new place, or click it and move it with the arrow keys. The deck keeps the new order.',
      /* The arrow stops at the peek's edge, so its wedge never lies over the peek's own heading. */
      anchor: { kind: 'page', element: element('[role="dialog"][aria-label^="Peeking at"]') },
      ...movedInPeek(),
    }),
  ];
}

const tasks = (snapshot: () => GameSnapshot) => [...stackTasks(snapshot), ...deckTasks(snapshot)];

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Hold a number key over a stack to split that many off',
  'Press and hold before dragging to carry a whole stack',
  'Drop a piece on its own kind to join the stack',
  '{Q} and {E} turn a piece, {F} flips a whole stack',
  '{R} shuffles the deck under your pointer',
  'Peek at a deck to see it in private, and reorder it',
];

export const movingPieces: ChapterScript = { slug: 'moving-pieces', checkpoint: 'turn-1-storm', tasks, learned };
