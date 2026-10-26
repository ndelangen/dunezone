import { HIDDEN_ZONE_DEPTH, HIDDEN_ZONE_WIDTH } from '@shared/play/hiddenZone';
import type { StoredPiece } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import { CARD_DEPTH, CARD_WIDTH } from '@shared/play/tableGeometry';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * Chapter 10, "The private side-table": a small table of the player's own for pieces that need a specific place.
 * Its reason clicks at once with the Atreides Kwisatz Haderach tracker (Norbert, 2026-10-26): the learner plays House Atreides,
 * lays the tracker card and its tiny Battle Loss Counter on the side-table, and moves the counter along the card's track as troops are lost.
 * The card and the counter are the site's published Kwisatz Haderach art; the chapter puts them in the Atreides hand itself,
 * since the faction does not bring them as Extras.
 */

const CARD = 'Kwisatz Haderach';
const COUNTER = 'Atreides Battle Loss Counter';

/** The tracker and its counter, as the game holds a captured card and token, owned by whichever faction the chapter seats. */
const hand: StoredPiece[] = [
  {
    id: 'tutorial-kwisatz-haderach',
    label: CARD,
    owner: '',
    color: '#d5ba8c',
    accent: '#ead9bb',
    items: [
      {
        id: 'tutorial-kwisatz-haderach-card',
        faceUp: true,
        artwork: {
          front: '{{origin}}/published/custom-cards/ns7e41fyyzajd2w392aedttr298gmmvm/card.jpg',
          /* The card is in no deck, so it wears the faction-card back an Atreides alliance card wears; it stays face up here. */
          back: '{{origin}}/published/cardback-presets/alliance/cardback.jpg',
          name: CARD,
          type: 'card-custom',
        },
      },
    ],
    stackKey: 'card:ns7e41fyyzajd2w392aedttr298gmmvm',
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'card',
  },
  {
    id: 'tutorial-battle-loss-counter',
    label: COUNTER,
    owner: '',
    color: '#d5ba8c',
    accent: '#ead9bb',
    items: [
      {
        id: 'tutorial-battle-loss-counter-token',
        faceUp: true,
        artwork: {
          front: '{{origin}}/published/round-tokens/ns7ccz318tqavsz7nkfv5hq4gh8gnn7h/token.jpg',
          back: '{{origin}}/published/round-tokens/ns7ccz318tqavsz7nkfv5hq4gh8gnn7h/token.jpg',
          name: COUNTER,
          type: 'token-disc',
          size: 0.5,
        },
      },
    ],
    stackKey: 'token:ns7ccz318tqavsz7nkfv5hq4gh8gnn7h',
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'force',
  },
];

const inHand = (name: string) => `[data-window="hand"] [aria-label="Drag ${name} from hand"]`;
const onSideTable = (name: string) => `[data-window="hidden-zone"] [aria-label="Move ${name} on private side-table"]`;

type Spot = Readonly<{ x: number; y: number; turn?: number }>;

/*
 * The card's track as its art draws it, in the card's 900 by 1263 pixels from its centre: spaces 1 to 4 across the upper row,
 * 5 to 7 across the lower one, and the Kwisatz Haderach's +2 slot after them.
 */
const TRACK_COLUMNS = [-266, -93, 89, 268];
const TRACK_ROWS = [260.5, 440.5];
const TRACK_SPACES = 7;

/** Within this many table units of a space's centre, the counter sits on it: under half the gap between two spaces. */
const ON_SPACE = 0.075;

/** The track space the counter sits on, from 1, or undefined when it sits on none; the card may be turned. */
function spaceUnder(counter: Spot, card: Spot) {
  const dx = (counter.x - card.x) * HIDDEN_ZONE_WIDTH;
  const dy = (counter.y - card.y) * HIDDEN_ZONE_DEPTH;
  const angle = ((card.turn ?? 0) * Math.PI) / 12;
  const across = dx * Math.cos(angle) + dy * Math.sin(angle);
  const down = -dx * Math.sin(angle) + dy * Math.cos(angle);
  for (let space = 1; space <= TRACK_SPACES; space++) {
    const x = (TRACK_COLUMNS[(space - 1) % 4]! / 900) * CARD_WIDTH;
    const y = (TRACK_ROWS[Math.floor((space - 1) / 4)]! / 1263) * CARD_DEPTH;
    if (Math.hypot(across - x, down - y) < ON_SPACE) {
      return space;
    }
  }
  return undefined;
}

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const spotOf = (name: string) =>
    (snapshot().hand ?? []).find((piece) => piece.items[0]?.artwork?.name === name)?.hiddenZone ?? undefined;
  const space = () => {
    const card = spotOf(CARD);
    const counter = spotOf(COUNTER);
    return card && counter ? spaceUnder(counter, card) : undefined;
  };
  return [
    task({
      id: 'open-hand',
      task: 'Open your hand',
      detail:
        'You play House Atreides here. Press {Space}, then {←} and {Space} again: your Kwisatz Haderach card and its counter are there.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'card',
      task: 'Move the Kwisatz Haderach card to your private side-table',
      detail:
        'It tracks the troops you lose in battles. Right-click it in your hand and choose Move to private side-table.',
      anchor: { kind: 'page', element: element(inHand(CARD)) },
      begin: () => null,
      done: () => spotOf(CARD) !== undefined,
    }),
    task({
      id: 'counter',
      task: 'Move the Battle Loss Counter there too',
      detail:
        'The tiny token is the marker for the card’s track. Right-click it and choose Move to private side-table.',
      anchor: { kind: 'page', element: element(inHand(COUNTER)) },
      begin: () => null,
      done: () => spotOf(COUNTER) !== undefined,
    }),
    task({
      id: 'open-zone',
      task: 'Open your private side-table',
      detail: 'It sits twice left on the compass: press {Space}, then {←} {←} and {Space}. Nobody else ever sees it.',
      anchor: { kind: 'page', element: viaCompass('hidden') },
      ...openedWindow(windowShown('hidden-zone')),
    }),
    task({
      id: 'zoom',
      task: 'Zoom in on the card',
      detail:
        'Scroll over the card to bring its track up close, and drag the felt to look around. Double-click the felt to zoom back out.',
      anchor: { kind: 'page', element: element(onSideTable(CARD)) },
      begin: () => null,
      done: () =>
        Number(document.querySelector('[data-window="hidden-zone"] [data-zoom]')?.getAttribute('data-zoom')) >= 2,
    }),
    task({
      id: 'first-loss',
      task: 'You lost a troop in battle: put the counter on space 1',
      detail:
        'Drag the counter onto the first space of the card’s track. Pieces stay exactly where you lay them, which is what the side-table is for.',
      anchor: { kind: 'page', element: element(onSideTable(COUNTER)) },
      begin: () => null,
      done: () => space() === 1,
    }),
    task({
      id: 'more-losses',
      task: 'You lost 2 more: move it to space 3',
      detail:
        'Every troop lost in battle moves it one space. After 7 you gain the Kwisatz Haderach, so the card always shows how close you are.',
      anchor: { kind: 'page', element: element(onSideTable(COUNTER)) },
      begin: () => null,
      done: () => space() === 3,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Right-click a piece in your hand to move it to your private side-table',
  '{Space} {←} {←} opens your private side-table, and only you see it',
  'Scroll over the side-table to zoom in on a card',
  'Pieces stay where you lay them, so a counter can sit on a card’s track',
  'Atreides counts troops lost in battles on the Kwisatz Haderach card, and gains it after 7',
];

export const thePrivateSideTable: ChapterScript = {
  slug: 'the-private-side-table',
  checkpoint: 'turn-1-storm',
  playAs: 'House Atreides',
  hand,
  tasks,
  learned,
};
