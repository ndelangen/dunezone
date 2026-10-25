import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import {
  at,
  element,
  onBoard,
  openedWindow,
  singleSpiceFaceUp,
  tableDeck,
  task,
  viaCompass,
  windowShown,
} from './guideChecks';

/*
 * Chapter 5, "What goes where": the table at the start of turn 1, seen from the learner's seat.
 * One task for each part of the screen, each done on the table itself, so the rail moves on only once the player found it.
 * Moving the camera is chapter 6's (Norbert, 2026-10-24), so this one starts at the decks.
 */

/* The table's own pieces: a card from a deck, troops onto the board and a card from the other deck. */
function tableTasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const mine = () => snapshot().bank?.factionId;
  const deck = (side: 'left' | 'right') => tableDeck(snapshot, side);
  /* Troops, not stacks: a troop dropped onto one already there joins its stack, and splitting a stack on the board adds none. */
  const myTroopsOnBoard = () =>
    pieces()
      .filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && onBoard(piece))
      .reduce((total, piece) => total + piece.items.length, 0);
  return [
    task({
      id: 'draw',
      task: 'Draw a Treachery card',
      detail: 'The Treachery deck sits on the left of the table. Right-click it and choose Draw a card.',
      anchor: { kind: 'table', point: () => at(deck('left')) },
      /* The card must leave the Treachery deck, so a Spice card drawn instead does not count. */
      begin: () => ({ hand: snapshot().hand?.length ?? 0, deck: deck('left')?.items.length ?? 0 }),
      done: (start) => (snapshot().hand?.length ?? 0) > start.hand && (deck('left')?.items.length ?? 0) < start.deck,
    }),
    task({
      id: 'ship',
      task: 'Put troops on the board',
      detail: 'Your reserves sit on the rim nearest you. Drag a troop from the stack onto any territory.',
      anchor: {
        kind: 'table',
        point: () => at(pieces().find((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && !onBoard(piece))),
      },
      begin: myTroopsOnBoard,
      done: (start) => myTroopsOnBoard() > start,
    }),
    task({
      id: 'spice',
      task: 'Turn over the top Spice card',
      detail:
        'The Spice deck sits on the right of the table. Drag its top card onto the table, then press F to turn it over.',
      anchor: { kind: 'table', point: () => at(deck('right')) },
      begin: () => singleSpiceFaceUp(pieces()),
      done: (start) => singleSpiceFaceUp(pieces()) > start,
    }),
  ];
}

/* Another player's window, which opens on its Chat tab; what they hold is on its Info tab. */
const otherPlayerWindow = () => document.querySelector('[data-window^="player:"]:not([aria-label^="You ("])');
const infoTab = (window: Element | null) =>
  [...(window?.querySelectorAll('[role="tab"]') ?? [])].find((tab) => tab.textContent?.trim() === 'Info') ?? null;

/* The windows over the table: the player's own things and another player's; then the phase. */
const panelTasks = (snapshot: () => GameSnapshot): GuideTask[] => [
  task({
    id: 'your-spice',
    task: 'Count your spice',
    detail: 'Your cards and spice are in the Hand & spice window. Press {Space}, then {←} and {Space} again.',
    anchor: { kind: 'page', element: viaCompass('hand') },
    ...openedWindow(windowShown('hand')),
  }),
  task({
    id: 'player-info',
    task: 'See what another player holds',
    detail: 'Every player is a faction token in the chat bar beside Controls. Click one, then its Info tab.',
    anchor: {
      kind: 'page',
      element: () =>
        infoTab(otherPlayerWindow()) ?? element('nav[aria-label="Chats"] button:not([aria-label^="Table chat"])')(),
    },
    ...openedWindow(() => infoTab(otherPlayerWindow())?.getAttribute('aria-selected') === 'true'),
  }),
  task({
    id: 'next-phase',
    task: 'Move the game on',
    detail: 'The header says the game is in the Storm. Press Next phase, top right.',
    anchor: {
      kind: 'page',
      element: () =>
        [...document.querySelectorAll('[aria-label="Phase navigation"] button')].find(
          (button) => button.textContent?.trim() === 'Next phase'
        ) ?? null,
    },
    begin: () => snapshot().phase,
    done: (start) => snapshot().phase !== start,
  }),
];

const tasks = (snapshot: () => GameSnapshot) => [...tableTasks(snapshot), ...panelTasks(snapshot)];

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Right-click a deck to draw a card',
  'Drag troops from your reserves onto a territory',
  'Press F to turn a card over',
  '{Space} opens the compass; left on it is your Hand & spice',
  "Each player's token in the chat bar opens their window",
  'Next phase moves the game on',
];

export const whatGoesWhere: ChapterScript = { slug: 'what-goes-where', checkpoint: 'turn-1-storm', tasks, learned };
