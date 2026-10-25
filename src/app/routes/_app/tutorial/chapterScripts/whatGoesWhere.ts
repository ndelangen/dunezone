import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { Vector3Tuple } from 'three';

import { wheelPixels } from '@app/widgets/tabletop/wheelPixels';

import type { GuideTask, GuideView } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';

/*
 * Chapter 5, "What goes where": the table at the start of turn 1, seen from the learner's seat.
 * One task for each part of the screen, each done on the table itself, so the band moves on only once the player found it.
 */

type Piece = GameSnapshot['table']['pieces'][number];

const at = (piece: { position: readonly number[] } | undefined) => (piece ? (piece.position as Vector3Tuple) : null);
const element = (selector: string) => () => document.querySelector(selector);
/* Whether the Hand & spice window shows, in the centre or in a slot. */
const handOpen = () => document.querySelector('[data-window="hand"]') !== null;
/* Whether another player's window shows its Info. */
const otherPlayerInfoOpen = () =>
  [...document.querySelectorAll('[data-window^="player:"]:not([aria-label^="You ("])')].some((window) =>
    [...window.querySelectorAll('[role="tab"][aria-selected="true"]')].some((tab) => tab.textContent?.trim() === 'Info')
  );
/*
 * A window task counts the player opening that window from the moment the task starts, so one left open by an earlier
 * run does not count until it is closed and opened again.
 */
const openedWindow = (open: () => boolean) => ({
  begin: () => ({ was: open(), closed: false }),
  done: (watch: { was: boolean; closed: boolean }) => {
    const shown = open();
    if (!shown) {
      watch.closed = true;
    }
    return shown && (watch.closed || !watch.was);
  },
});

const onBoard = (piece: { position: readonly number[] }) =>
  Math.hypot(piece.position[0]!, piece.position[2]!) < BOARD_RADIUS;
/* The camera dial marks the view it shows, so a view the player chose early, even during the last task's tick, still counts. */
const showing = (view: string) => () =>
  document.querySelector(`[aria-label^="Focus on ${view}"]`)?.getAttribute('aria-pressed') === 'true';
const cameraDistance = ({ camera }: GuideView) => camera?.position.length() ?? 0;

/*
 * Zooming counts only the player's own scrolling over the table, measured from where the camera was at their first scroll,
 * so the camera still gliding into its opening view never does the task for them.
 */
const scrolledIn = () => ({
  begin: (view: GuideView) => {
    const watch = { scrolled: 0, from: null as number | null, stop: new AbortController() };
    const scroll = (event: WheelEvent) => {
      /* Counted in pixels as the camera counts it, whether the browser reports the turn in pixels, lines or pages. */
      const pixels = wheelPixels(event.deltaY, event.deltaMode);
      if (event.target instanceof HTMLCanvasElement && pixels > 0) {
        watch.from ??= cameraDistance(view);
        watch.scrolled += pixels;
      }
    };
    document.addEventListener('wheel', scroll, { capture: true, passive: true, signal: watch.stop.signal });
    return watch;
  },
  done: (watch: { scrolled: number; from: number | null }, view: GuideView) =>
    watch.from !== null && watch.scrolled >= 200 && cameraDistance(view) < watch.from * 0.85,
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

/* Each task keeps its own kind of baseline; the guide only hands it back. */
const task = <Baseline>(definition: GuideTask<Baseline>) => definition as unknown as GuideTask;

/* Finding the parts of the screen through the camera: in close, to the side, and back. */
const cameraTasks = (): GuideTask[] => [
  task({
    id: 'zoom',
    task: 'Look closer at Arrakis',
    detail: 'Scroll down over the board. The camera moves in toward the spot under your pointer.',
    anchor: { kind: 'table', point: () => [0, 0, 0] },
    ...scrolledIn(),
  }),
  task({
    id: 'look-left',
    task: 'Look at the left of the table',
    detail: 'The camera dial, bottom right of the table, jumps the view. Press L.',
    anchor: { kind: 'page', element: element('[aria-label="Focus on left"]') },
    begin: () => undefined,
    done: showing('left'),
  }),
  task({
    id: 'look-back',
    task: 'Go back to the map',
    detail: 'M on the same dial brings the whole board back, with both decks in view.',
    anchor: { kind: 'page', element: element('[aria-label^="Focus on map"]') },
    begin: () => undefined,
    done: showing('map'),
  }),
];

/*
 * Spice cards lying face up on their own. The table hands out cards under handles that change as they move,
 * so cards are counted by what they show rather than followed by id; a whole deck turned over is one pile, so it does not count.
 */
const singleSpiceFaceUp = (pieces: Piece[]) =>
  pieces.filter(
    (piece) => piece.items.length === 1 && piece.items[0]!.faceUp && piece.items[0]!.artwork?.type === 'card-spice'
  ).length;

/* The table's own pieces: a card from a deck, troops onto the board and a card from the other deck. */
function tableTasks(snapshot: () => GameSnapshot): GuideTask[] {
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const mine = () => snapshot().bank?.factionId;
  /*
   * The ruleset's decks are keyed by their asset, so they are found where the table lays them out:
   * Treachery on the left of the table and Spice on the right, with the off-table stores left out.
   */
  const deck = (side: 'left' | 'right') =>
    pieces().find(
      (piece) =>
        piece.stackKey?.startsWith('deck:') &&
        Math.abs(piece.position[0]) <= BOARD_RADIUS * 2 &&
        (side === 'left' ? piece.position[0] < 0 : piece.position[0] > 0)
    );
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

/* The windows around the table: the player's own things, another player's, and the phase. */
const panelTasks = (snapshot: () => GameSnapshot): GuideTask[] => [
  task({
    id: 'your-spice',
    task: 'Count your spice',
    detail: 'Your own things are in the Hand & spice window. Press Space and pick Hand & spice, on the left.',
    anchor: { kind: 'page', element: element('[data-spot="hand"], [data-compass-launcher]') },
    ...openedWindow(handOpen),
  }),
  task({
    id: 'player-info',
    task: 'See what another player holds',
    detail: 'The players are the tokens beside Controls. Click one, then its Info tab.',
    anchor: { kind: 'page', element: element('nav[aria-label="Chats"] button:not([aria-label^="Table chat"])') },
    ...openedWindow(otherPlayerInfoOpen),
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

const tasks = (snapshot: () => GameSnapshot) => [...cameraTasks(), ...tableTasks(snapshot), ...panelTasks(snapshot)];

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Scroll over the board to look closer',
  'Jump the view with the camera dial: L for the left, M for the map',
  'Right-click a deck to draw a card',
  'Drag troops from your reserves onto a territory',
  'Press F to turn a card over',
  'Your own things are in the Hand & spice window',
  "Other players' things are behind their tokens beside Controls",
  'Next phase moves the game on',
];

export const whatGoesWhere: ChapterScript = { slug: 'what-goes-where', checkpoint: 'turn-1-storm', tasks, learned };
