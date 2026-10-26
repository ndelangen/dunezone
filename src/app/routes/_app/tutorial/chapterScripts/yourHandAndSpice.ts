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
 * Chapter 10, "Your hand and spice": a card goes from the table into the player's hand and back out,
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
  return [
    task({
      id: 'lay-card',
      task: 'Lay a Spice card on the table',
      detail:
        'Press down on the Spice deck, on the right of the table, and swipe away at once to take its top card. Drop it beside the deck.',
      anchor: { kind: 'table', point: () => at(spiceDeck()) },
      begin: () => spiceDeck()?.items.length ?? 0,
      done: (start) => (spiceDeck()?.items.length ?? 0) < start,
    }),
    task({
      id: 'take',
      task: 'Take it into your hand',
      detail:
        'Right-click the card and choose Take into hand. A card or a leader on the table can always go to your hand.',
      anchor: { kind: 'table', point: () => at(looseSpiceCard(pieces(), spiceDeck())) },
      begin: inHand,
      done: (start) => inHand() > start,
    }),
    task({
      id: 'open-hand',
      task: 'Open your hand',
      detail: 'Your hand is in the Hand & spice window. Press {H}, or {Space}, then {←} and {Space} again.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'close-up',
      task: 'Read the card up close',
      detail:
        'Point at the card in your hand and hold {Alt}. It shows flat and large, as on the table; read it, then let go.',
      anchor: { kind: 'page', element: lastElement(HAND_PIECE) },
      ...closeUpShown(),
    }),
    task({
      id: 'play',
      task: 'Play it back onto the table',
      detail:
        'Drag the card out of the window and drop it on the table. Only you saw its face while it was in your hand.',
      anchor: { kind: 'page', element: lastElement(HAND_PIECE) },
      begin: inHand,
      done: (start) => inHand() < start,
    }),
    task({
      id: 'reorder',
      task: 'Put your leaders in your own order',
      detail:
        'Drag a leader along the Leaders shelf and drop it in a new place. The order is yours alone and stays as you left it.',
      anchor: { kind: 'page', element: element('[data-window="hand"] [data-group="leaders"]') },
      begin: handOrder,
      done: (start) => handOrder() !== start,
    }),
    task({
      id: 'withdraw',
      task: 'Take spice from your reserve',
      detail: 'The big number at the top of the window is your reserve. Pick an amount beside it and press Withdraw.',
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
