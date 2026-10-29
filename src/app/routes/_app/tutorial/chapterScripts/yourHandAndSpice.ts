import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import {
  at,
  closePieceMenu,
  closeUpShown,
  element,
  openedWindow,
  tableDeck,
  task,
  viaCompass,
  windowShown,
} from './guideChecks';

/*
 * "Your hand and spice": a card goes from the table into the player's hand and back out,
 * and spice comes out of their reserve, all through the Hand & spice window.
 */

const HAND_CARD = '[data-window="hand"] [data-group="card:Treachery"] [aria-label$=" from hand"]';

const treacheryCards = (snapshot: GameSnapshot) =>
  (snapshot.hand ?? []).filter(
    (piece) => !piece.hiddenZone && piece.items.some((item) => item.artwork?.type === 'card-treachery')
  );

/** The Treachery row's order, unaffected by rearranging leaders or other shelves. */
function cardOrder(snapshot: GameSnapshot) {
  const cards = treacheryCards(snapshot).map((piece) => piece.id);
  const order = snapshot.handOrder ?? [];
  return [...order.filter((id) => cards.includes(id)), ...cards.filter((id) => !order.includes(id))];
}

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces;
  const treacheryDeck = () => tableDeck(snapshot, 'left');
  const cards = () => treacheryCards(snapshot());
  const reserve = () => snapshot().bank?.balance ?? 0;
  /* Playing a private card gives it a new public handle. Flipping keeps that handle. */
  const played = { id: null as string | null };
  const playedCard = () => pieces().find((piece) => piece.id === played.id);
  return [
    task({
      id: 'draw',
      task: 'Draw four Treachery cards',
      detail:
        "Let's give you a hand to practice with. Hover over the Treachery deck on the left and press {T} four times. Each card goes straight into your hand.\n\nYou can also right-click the deck and choose Draw a card.",
      anchor: { kind: 'table', point: () => at(treacheryDeck()) },
      begin: () => cards().length,
      done: (start) => cards().length >= start + 4,
      finish: closePieceMenu,
    }),
    task({
      id: 'open-hand',
      task: 'Open your hand',
      detail: "Press {H} to open Hand & spice. Only you can see what's in your hand.",
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'close-up',
      task: 'Read the card up close',
      detail: 'Hover over a Treachery card and hold {Alt} to read it. Release {Alt} to close the preview.',
      anchor: { kind: 'page', element: element(HAND_CARD) },
      ...closeUpShown(),
    }),
    task({
      id: 'reorder',
      task: 'Reorder your cards',
      detail:
        'Drag a card to another position in the Treachery row. The other cards will make room for it.\n\nThis only changes the order in your hand.',
      anchor: { kind: 'page', element: element('[data-window="hand"] [data-group="card:Treachery"]') },
      begin: () => ({ order: cardOrder(snapshot()) }),
      done: (start) => {
        const order = cardOrder(snapshot());
        if (order.length !== start.order.length || order.some((id) => !start.order.includes(id))) {
          start.order = order;
          return false;
        }
        return order.some((id, index) => id !== start.order[index]);
      },
    }),
    task({
      id: 'play',
      task: 'Play a card',
      detail:
        'Drag one of your Treachery cards from your hand onto a clear spot on the table, away from the decks and other cards.\n\nAnything you drag from your hand to the table lands face down, including cards. You choose when to reveal it.',
      anchor: { kind: 'page', element: element(HAND_CARD) },
      begin: () => ({ hand: cards().length, table: new Set(pieces().map((piece) => piece.id)) }),
      done: (start) => {
        if (cards().length >= start.hand) {
          return false;
        }
        played.id =
          pieces().find(
            (piece) => !piece.inventory && !start.table.has(piece.id) && piece.stackKey === treacheryDeck()?.stackKey
          )?.id ?? null;
        return played.id !== null;
      },
    }),
    task({
      id: 'reveal',
      task: 'Reveal your card',
      detail: 'To show everyone your card, hover over it and press {F} to turn it face up.',
      anchor: { kind: 'table', point: () => at(playedCard()) },
      begin: () => undefined,
      done: () => playedCard()?.items.every((item) => item.faceUp) === true,
    }),
    task({
      id: 'withdraw',
      task: 'Take spice from your reserve',
      detail:
        'Need spice on the table? Your reserve is at the top of Hand & spice.\n\nChoose an amount, then grab the spice token preview and drag it onto the table. You decide exactly where it goes.',
      anchor: { kind: 'page', element: element('[data-window="hand"] [aria-label="Spice reserve balance"]') },
      begin: reserve,
      done: (start) => reserve() < start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Hover over a deck and press {T} to draw a card, or use Draw a card in its menu',
  '{H}, or {Space} {←}, opens your Hand & spice',
  'Hold {Alt} over a card in your hand to read it',
  'Pieces dragged from your hand to the table land face down',
  'Hover over a played card and press {F} to reveal it',
  'Drag cards along the Treachery row to sort your hand',
  'Choose an amount of spice, then drag it from your reserve onto the table',
];

export const yourHandAndSpice: ChapterScript = {
  slug: 'your-hand-and-spice',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
