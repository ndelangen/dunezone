import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, lastElement, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * Chapter 10, "The hidden zone": a private table of the player's own (Norbert, 2026-10-25: a chapter of its own).
 * A card goes from the hand into the zone, is laid where the player wants it, and comes back to the hand.
 */

const HAND_PIECE = '[data-window="hand"] [aria-label$=" from hand"]';
const ZONE_PIECE = '[data-window="hidden-zone"] [aria-label$=" in hidden zone"]';

type Spot = Readonly<{ x: number; y: number }>;

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const hand = () => snapshot().hand ?? [];
  const inZone = () => hand().filter((piece) => piece.hiddenZone).length;
  /* Where each piece in the zone lies, by id: a card keeps its handle while it stays in the player's hand. */
  const spots = () => new Map(hand().flatMap((piece) => (piece.hiddenZone ? [[piece.id, piece.hiddenZone]] : [])));
  return [
    task({
      id: 'open-hand',
      task: 'Open your hand',
      detail: 'You start with a few Treachery cards there. Press Space, then ← and Space again.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'hide',
      task: 'Move the card to your hidden zone',
      detail: 'Right-click the card in your hand and choose Move to hidden zone.',
      anchor: { kind: 'page', element: lastElement(HAND_PIECE) },
      begin: inZone,
      done: (start) => inZone() > start,
    }),
    task({
      id: 'open-zone',
      task: 'Open your hidden zone',
      detail: 'It sits twice left on the compass: press Space, then ← ← and Space. Nobody else ever sees it.',
      anchor: { kind: 'page', element: viaCompass('hidden') },
      ...openedWindow(windowShown('hidden-zone')),
    }),
    task({
      id: 'arrange',
      task: 'Lay the card where you want it',
      detail:
        'Drag it anywhere inside the zone. It stays where you put it, so you can lay a token on a card to keep track.',
      anchor: { kind: 'page', element: element(ZONE_PIECE) },
      begin: spots,
      done: (start: Map<string, Spot>) =>
        [...spots()].some(([id, spot]) => {
          const from = start.get(id);
          return from !== undefined && Math.hypot(spot.x - from.x, spot.y - from.y) > 0.05;
        }),
    }),
    task({
      id: 'back',
      task: 'Take it back into your hand',
      detail: 'Right-click the card in the zone and choose Move to hand.',
      anchor: { kind: 'page', element: element(ZONE_PIECE) },
      begin: inZone,
      done: (start) => inZone() < start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Right-click a card in your hand to move it to your hidden zone',
  'Space ← ← opens your hidden zone',
  'Only you see what lies there',
  'Pieces stay where you lay them, so a token can mark a card',
  'Right-click a piece there to move it back to your hand',
];

export const theHiddenZone: ChapterScript = {
  slug: 'the-hidden-zone',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
