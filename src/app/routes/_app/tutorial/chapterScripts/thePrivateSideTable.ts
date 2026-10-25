import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, lastElement, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * Chapter 10, "The private side-table": a small table of the player's own for pieces that need a specific place
 * (Norbert, 2026-10-25: a chapter of its own, renamed from the hidden zone). A card goes from the hand onto it, is laid
 * where the player wants it, turned, and comes back to the hand.
 */

const HAND_PIECE = '[data-window="hand"] [aria-label$=" from hand"]';
const SIDE_PIECE = '[data-window="hidden-zone"] [aria-label$=" on private side-table"]';

type Spot = Readonly<{ x: number; y: number; turn?: number }>;

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const hand = () => snapshot().hand ?? [];
  const onSide = () => hand().filter((piece) => piece.hiddenZone).length;
  /* Where each piece on the side-table lies, by id: a card keeps its handle while it stays in the player's hand. */
  const spots = () => new Map(hand().flatMap((piece) => (piece.hiddenZone ? [[piece.id, piece.hiddenZone]] : [])));
  return [
    task({
      id: 'open-hand',
      task: 'Open your hand',
      detail: 'You start with a few Treachery cards there. Press {Space}, then {←} and {Space} again.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'hide',
      task: 'Move the card to your private side-table',
      detail: 'Right-click the card in your hand and choose Move to private side-table.',
      anchor: { kind: 'page', element: lastElement(HAND_PIECE) },
      begin: onSide,
      done: (start) => onSide() > start,
    }),
    task({
      id: 'open-zone',
      task: 'Open your private side-table',
      detail: 'It sits twice left on the compass: press {Space}, then {←} {←} and {Space}. Nobody else ever sees it.',
      anchor: { kind: 'page', element: viaCompass('hidden') },
      ...openedWindow(windowShown('hidden-zone')),
    }),
    task({
      id: 'arrange',
      task: 'Lay the card where you want it',
      detail:
        'Drag it anywhere on the side-table. It stays where you put it, for pieces that need a specific place, such as a marker on a card’s track.',
      anchor: { kind: 'page', element: element(SIDE_PIECE) },
      begin: spots,
      done: (start: Map<string, Spot>) =>
        [...spots()].some(([id, spot]) => {
          const from = start.get(id);
          return from !== undefined && Math.hypot(spot.x - from.x, spot.y - from.y) > 0.05;
        }),
    }),
    task({
      id: 'turn',
      task: 'Turn the card',
      detail: 'Point at it and press {Q} or {E} to turn it a little, or right-click it for a quarter turn.',
      anchor: { kind: 'page', element: element(SIDE_PIECE) },
      begin: spots,
      done: (start: Map<string, Spot>) =>
        [...spots()].some(([id, spot]) => {
          const from = start.get(id);
          return from !== undefined && (spot.turn ?? 0) !== (from.turn ?? 0);
        }),
    }),
    task({
      id: 'back',
      task: 'Take it back into your hand',
      detail: 'Right-click the card on the side-table and choose Move to hand.',
      anchor: { kind: 'page', element: element(SIDE_PIECE) },
      begin: onSide,
      done: (start) => onSide() < start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Right-click a card in your hand to move it to your private side-table',
  '{Space} {←} {←} opens your private side-table',
  'Only you see what lies there',
  'Pieces stay where you lay them, so a marker can sit on a card’s track',
  '{Q} and {E} turn the piece under the pointer',
  'Right-click a piece there to move it back to your hand',
];

export const thePrivateSideTable: ChapterScript = {
  slug: 'the-private-side-table',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
