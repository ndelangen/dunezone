import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import {
  at,
  closeUpShown,
  element,
  lastElement,
  openedWindow,
  tableDeck,
  task,
  viaCompass,
  windowShown,
} from './guideChecks';
import type { Piece } from './guideChecks';

/*
 * "Your hand and spice": a card goes from the table into the player's hand and back out,
 * and spice comes out of their reserve, all through the Hand & spice window.
 */

const HAND_PIECE = '[data-window="hand"] [aria-label$=" from hand"]';

/*
 * A Spice card lying on the table on its own, not the deck it came from. A face-down card shows no face,
 * so it is known by the stack it would join again: the deck's own.
 */
const looseSpiceCard = (pieces: readonly Piece[], deck: Piece | undefined) =>
  pieces.find(
    (piece) =>
      deck !== undefined &&
      piece !== deck &&
      !piece.inventory &&
      piece.items.length === 1 &&
      piece.stackKey === deck.stackKey
  );

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces;
  const spiceDeck = () => tableDeck(snapshot, 'right');
  /* The hand as the Hand & spice window shows it: what the player laid on the private side-table is not in it. */
  const inHand = () => (snapshot().hand ?? []).filter((piece) => !piece.hiddenZone).length;
  const reserve = () => snapshot().bank?.balance ?? 0;
  const handOrder = () => JSON.stringify(snapshot().handOrder ?? []);
  /* The card the player took into their hand, by the id it arrived under, so the arrow finds it among the cards already there. */
  const taken = { id: null as string | null };
  const handIds = () => new Set((snapshot().hand ?? []).filter((piece) => !piece.hiddenZone).map((piece) => piece.id));
  const takenCard = () =>
    (taken.id && document.querySelector(`${HAND_PIECE}[data-piece-id="${CSS.escape(taken.id)}"]`)) ||
    lastElement(HAND_PIECE)();
  return [
    task({
      id: 'lay-card',
      task: 'Take a card from the deck',
      detail:
        "Let's see how your hand works. Drag the top Spice card off the deck on the right and drop it beside the deck.\n\nStart moving straight away to take just one card.",
      anchor: { kind: 'table', point: () => at(spiceDeck()) },
      begin: () => spiceDeck()?.items.length ?? 0,
      done: (start) => (spiceDeck()?.items.length ?? 0) < start,
    }),
    task({
      id: 'take',
      task: 'Put it in your hand',
      detail: 'Right-click the card and choose Take into hand. You can do the same with leaders.',
      anchor: { kind: 'table', point: () => at(looseSpiceCard(pieces(), spiceDeck())) },
      begin: handIds,
      done: (start) => {
        taken.id = (snapshot().hand ?? []).find((piece) => !piece.hiddenZone && !start.has(piece.id))?.id ?? null;
        return taken.id !== null;
      },
    }),
    task({
      id: 'open-hand',
      task: 'Open your hand',
      detail: 'Press {H} to open Hand & spice.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'close-up',
      task: 'Read the card up close',
      detail: 'Hover over the card and hold {Alt} to read it. Release {Alt} to close the preview.',
      anchor: { kind: 'page', element: takenCard },
      ...closeUpShown(),
    }),
    task({
      id: 'play',
      task: 'Play the card',
      detail:
        'Ready to put it back? Drag the card from your hand onto the table.\n\nCards in your hand stay private until you play them.',
      anchor: { kind: 'page', element: takenCard },
      begin: inHand,
      done: (start) => inHand() < start,
    }),
    task({
      id: 'reorder',
      task: 'Reorder your leaders',
      detail: 'Drag a leader to a new position in the Leaders row. This changes the order in your hand only.',
      anchor: { kind: 'page', element: element('[data-window="hand"] [data-group="leaders"]') },
      begin: handOrder,
      done: (start) => handOrder() !== start,
    }),
    task({
      id: 'withdraw',
      task: 'Take spice from your reserve',
      detail:
        'Need spice on the table? Your reserve is at the top of Hand & spice.\n\nChoose an amount and press Withdraw.',
      anchor: { kind: 'page', element: element('[data-window="hand"] [aria-label="Spice reserve balance"]') },
      begin: reserve,
      done: (start) => reserve() < start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Right-click a card on the table and choose Take into hand',
  '{H}, or {Space} {←}, opens your Hand & spice',
  'Hold {Alt} over a card in your hand to read it',
  'Drag a card from your hand onto the table to play it',
  'Drag a card or leader along its shelf to sort your hand',
  'Withdraw spice from your reserve onto the table',
];

export const yourHandAndSpice: ChapterScript = {
  slug: 'your-hand-and-spice',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
