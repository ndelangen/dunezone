import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, closePieceMenu, element, grownCarryLanded, holdsAll, tableDeck, task } from './guideChecks';
import type { Piece } from './guideChecks';

/*
 * "Decks and dealing": what a deck does beyond a draw, on the same table as Moving pieces.
 * A deck shuffled, peeked at and reordered, a card dealt to another player, a few cards split off with a number key,
 * and two cards taken in one carry with T. Everything to do with cards is here, the pieces themselves in Moving pieces;
 * locking is left out, as it is not worth teaching (Norbert, 2026-10-26).
 */

/* Loose cards of one deck lying on the table in stacks of at least `size`, by the stack key they would join the deck with again. */
const loose = (pieces: readonly Piece[], deck: Piece | undefined) =>
  deck === undefined
    ? []
    : pieces.filter((piece) => piece !== deck && !piece.inventory && piece.stackKey === deck.stackKey);

/* Every Treachery card the other players hold: a hand's size is public, as the rules make it. */
const othersHold = (snapshot: GameSnapshot) =>
  Object.entries(snapshot.handCounts ?? {})
    .filter(([factionId]) => factionId !== snapshot.bank?.factionId)
    .reduce((total, [, count]) => total + count, 0);

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

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const pieces = () => snapshot().table.pieces;
  const treachery = () => tableDeck(snapshot, 'left');
  const spice = () => tableDeck(snapshot, 'right');
  return [
    task({
      id: 'shuffle',
      task: 'Shuffle the Spice deck',
      detail: "Let's try the deck controls. Hover over the Spice deck on the right and press {R} to shuffle it.",
      anchor: { kind: 'table', point: () => at(spice()) },
      begin: () => spice()?.shuffleRevision ?? 0,
      done: (start) => (spice()?.shuffleRevision ?? 0) > start,
    }),
    task({
      id: 'peek',
      task: 'Peek at the Spice deck',
      detail:
        "Curious what's in the deck? Right-click it and choose Peek at the deck.\n\nOnly you see the cards, but the others can see that you peeked.",
      anchor: { kind: 'table', point: () => at(spice()) },
      begin: () => undefined,
      done: () => peekedOrder() !== null,
    }),
    task({
      id: 'reorder',
      task: 'Reorder the deck',
      detail:
        "While you're peeking, drag a card to another position in the row. You can also select it and use the arrow keys.\n\nThat changes the order of the deck for everyone.",
      /* The arrow stops at the peek's edge, so its wedge never lies over the peek's own heading. */
      anchor: { kind: 'page', element: element('[role="dialog"][aria-label^="Peeking at"]') },
      ...movedInPeek(),
    }),
    task({
      id: 'deal',
      task: 'Deal a card',
      detail:
        "You can deal straight into another player's hand. Right-click the Treachery deck on the left, click Deal a card to open its choices, then click a faction.",
      anchor: { kind: 'table', point: () => at(treachery()) },
      begin: () => othersHold(snapshot()),
      done: (start) => othersHold(snapshot()) > start,
      /* The ring stays open on its list of factions for another deal, and would cover the deck the next step uses. */
      finish: closePieceMenu,
    }),
    task({
      id: 'split',
      task: 'Split off six Treachery cards',
      detail:
        'Need a pile for bidding? Hover over the Treachery deck on the left and hold {6} for a second. The top six cards form a separate face-down pile.',
      anchor: { kind: 'table', point: () => at(treachery()) },
      begin: () => ({ seen: players.acceptedActions().length, deck: treachery()?.id }),
      done: ({ seen, deck }) =>
        players
          .acceptedActions()
          .slice(seen)
          .some(
            ({ action, source }) =>
              action.kind === 'split' &&
              action.pieceId === deck &&
              action.count === 6 &&
              source &&
              source.items.length >= 6 &&
              pieces().some(
                (piece) =>
                  piece.id !== deck &&
                  !piece.inventory &&
                  piece.items.length === 6 &&
                  piece.items.every((item) => !item.faceUp) &&
                  holdsAll(
                    piece,
                    source.items.slice(-6).map((item) => item.id)
                  )
              )
          ),
    }),
    task({
      id: 'take-two',
      task: 'Pick up two cards',
      detail:
        'Drag the top Treachery card off the deck, then hold it over the deck again. Press {T} or right-click to add a second card.\n\nDrop both on the table.',
      anchor: { kind: 'table', point: () => at(treachery()) },
      /* Holding 2 over the deck, taught just before, makes a pile of two too, but no carry grows on the way. */
      ...grownCarryLanded(players.landings, () => loose(pieces(), treachery())),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  '{R} shuffles the deck under your pointer',
  'Peek at a deck to see it in private, and reorder it',
  'Right-click a deck and choose Deal a card to give one to a player',
  'Hold a number key over a deck to split that many cards off it',
  'Press {T} or right-click while carrying a card to take the next one with it',
];

export const decksAndDealing: ChapterScript = {
  slug: 'decks-and-dealing',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
