import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { at, element, onBoard, task } from './guideChecks';
import type { Piece } from './guideChecks';

/*
 * Chapter 7, "Moving pieces": the hands-on controls chapter 5 only touched, on the same table.
 * A stack split with a number key, carried whole, joined, turned and flipped; then a deck shuffled and peeked at.
 * Taking more with T, locking, dealing and laying cards from a deck with a number key wait for a later chapter.
 */

/* The cards of a deck held open by a peek, as the peek names them, top first; null while no deck is open. */
const peekedOrder = () => {
  const row = document.querySelector('[role="dialog"][aria-label^="Peeking at"] ol');
  return row
    ? [...row.querySelectorAll('[role="button"]')].map((card) => card.getAttribute('aria-label')?.split(',')[0] ?? '')
    : null;
};

/*
 * Moving a card counts the order the peek first showed against the order it shows now, so the task waits for the deck to open
 * and then for one card to change place, by dragging or by the arrow keys.
 */
const movedInPeek = () => ({
  begin: () => ({ first: null as string[] | null }),
  done: (watch: { first: string[] | null }) => {
    const order = peekedOrder();
    if (!order) {
      return false;
    }
    watch.first ??= order;
    return order.some((name, index) => name !== watch.first![index]);
  },
});

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const myTroops = () =>
    pieces().filter((piece) => piece.stackKey?.startsWith(`troops:${snapshot().bank?.factionId}:`));
  const reserves = () => myTroops().filter((piece) => !onBoard(piece));
  const onTheBoard = () => myTroops().filter(onBoard);
  const total = (stacks: Piece[]) => stacks.reduce((sum, piece) => sum + piece.items.length, 0);
  /* The biggest of the player's reserve stacks, where a split comes from, and the smallest of two or more, where it went. */
  const biggestReserve = () => reserves().toSorted((a, b) => b.items.length - a.items.length)[0];
  const splitStack = () =>
    reserves()
      .filter((piece) => piece.items.length > 1)
      .toSorted((a, b) => a.items.length - b.items.length)[0];
  const spiceDeck = () =>
    pieces().find(
      (piece) =>
        piece.stackKey?.startsWith('deck:') && Math.abs(piece.position[0]) <= BOARD_RADIUS * 2 && piece.position[0] > 0
    );
  /* A piece as it was at the task's start, by id: turning and flipping leave a piece where it lies under the same id. */
  const byId = () => new Map(onTheBoard().map((piece) => [piece.id, piece]));
  return [
    task({
      id: 'split',
      task: 'Split three troops off',
      detail:
        'Point at your reserves on the rim nearest you and hold 3 for a second. Three troops slide off beside them.',
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
        return jumped;
      },
    }),
    task({
      id: 'join',
      task: 'Add a troop to them',
      detail: 'Drag one troop from your reserves and drop it on your troops on the board. It joins their stack.',
      anchor: { kind: 'table', point: () => at(onTheBoard()[0]) },
      begin: () => ({ troops: total(onTheBoard()), stacks: onTheBoard().length }),
      done: (start) => total(onTheBoard()) > start.troops && onTheBoard().length <= start.stacks,
    }),
    task({
      id: 'turn',
      task: 'Turn your stack',
      detail: 'Point at your troops on the board and press Q or E. Each press turns them a step.',
      anchor: { kind: 'table', point: () => at(onTheBoard()[0]) },
      begin: byId,
      done: (start) =>
        onTheBoard().some((piece) => {
          const before = start.get(piece.id);
          return before !== undefined && before.orientation !== piece.orientation;
        }),
    }),
    task({
      id: 'flip',
      task: 'Flip the whole stack',
      detail: 'Still pointing at them, press F. A stack turns over all at once, as a single card does.',
      anchor: { kind: 'table', point: () => at(onTheBoard()[0]) },
      begin: byId,
      done: (start) =>
        onTheBoard().some((piece) => {
          const before = start.get(piece.id);
          return before !== undefined && (piece.flipRevision ?? 0) > (before.flipRevision ?? 0);
        }),
    }),
    task({
      id: 'shuffle',
      task: 'Shuffle the Spice deck',
      detail: 'Point at the Spice deck on the right of the table and press R.',
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
      detail: 'Drag a card along the row to a new place, or move it with the arrow keys. The deck keeps the new order.',
      anchor: { kind: 'page', element: element('[role="dialog"][aria-label^="Peeking at"] ol') },
      ...movedInPeek(),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Hold a number over a stack to split that many off',
  'Press and hold before dragging to carry a whole stack',
  'Drop a piece on its own kind to join the stack',
  'Q and E turn a piece, F flips a whole stack',
  'R shuffles the deck under your pointer',
  'Peek at a deck to see it in private, and reorder it',
];

export const movingPieces: ChapterScript = { slug: 'moving-pieces', checkpoint: 'turn-1-storm', tasks, learned };
