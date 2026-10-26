import { factionTokenOf } from '@shared/play/factionToken';
import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, element, nextPhaseButton, onBoard, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * Chapter 12, "Setup": the game's setup steps as the Setup window runs them, from the Bene Gesserit prediction to the starting troops.
 * The learner plays the Bene Gesserit, the one faction in the shared setup with a prediction, so the chapter opens on it.
 * Then the hand shows what each faction starts with, the Traitor step deals five face down in front of every seat,
 * and the starting troops go onto the board once the map shows. What a faction keeps and where its troops start are its own
 * rules, which the Setup window quotes; the chapter teaches where they happen, never the rules.
 */

/* How long apart the other players say they are ready, so the count beside Ready climbs one player at a time. */
const READY_GAP_MS = 700;

/* The other players say they are ready one after another, once the task starts; the timers stop if it ends first. */
const othersReadyUp = (players: TablePlayers) => {
  const timers = players
    .others()
    .map((seat, index) =>
      setTimeout(() => players.act(seat, { kind: 'ready', ready: true }), (index + 1) * READY_GAP_MS)
    );
  return () => timers.forEach(clearTimeout);
};

const isTraitor = (piece: { items: readonly { artwork?: { type?: string } }[] }) =>
  piece.items[0]?.artwork?.type === 'card-traitor';

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const mine = () => snapshot().bank?.factionId ?? '';
  const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
  const setupIndex = () => snapshot().setup?.index ?? -1;
  const predictionLocked = () =>
    Object.values(snapshot().predictions ?? {}).some((entry) => entry.factionId === mine());
  const traitorsInHand = () =>
    (snapshot().hand ?? []).filter(isTraitor).reduce((total, piece) => total + piece.items.length, 0);
  const myReserves = () => pieces().find((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && !onBoard(piece));
  /* The learner's five lie face down between their seat and the board; the pile nearest their faction token is theirs. */
  const myTraitors = () => {
    const seat = factionTokenOf(snapshot().table.pieces, mine())?.position;
    return pieces()
      .filter(isTraitor)
      .sort((a, b) =>
        seat
          ? Math.hypot(a.position[0]! - seat[0]!, a.position[2]! - seat[2]!) -
            Math.hypot(b.position[0]! - seat[0]!, b.position[2]! - seat[2]!)
          : 0
      )[0];
  };
  const myTroopsOnBoard = () =>
    pieces()
      .filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && onBoard(piece))
      .reduce((total, piece) => total + piece.items.length, 0);
  const setupWindow = (selector: string) => element(`[data-window="setup"] ${selector}`);
  return [
    task({
      id: 'prediction',
      task: 'Lock your prediction',
      detail:
        'Setup runs as steps in the Setup window, and the header names the step. You play the Bene Gesserit, whose step comes first: pick a Predicted winner and a Predicted turn, then press Lock prediction. Only you see the choice.',
      anchor: { kind: 'page', element: setupWindow('button') },
      begin: () => undefined,
      done: predictionLocked,
    }),
    task({
      id: 'hand',
      task: 'Look at what you start with',
      detail:
        'Your prediction is now a card in your hand, beside your leaders, your alliance card and any Extras your faction brings. Press {H} to open Hand & spice.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'to-traitors',
      task: 'Move on to Traitor selection',
      detail: 'The prediction needs nobody else, so Next phase, top right, moves setup on to its next step.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => setupIndex() >= 1,
    }),
    task({
      id: 'peek-traitors',
      task: 'Look at your traitors',
      detail:
        'Every seat has five Traitor cards face down in front of it. Right-click the pile in front of yours and choose Peek at the deck: the faces show only to you.',
      anchor: { kind: 'table', point: () => at(myTraitors()) },
      begin: () => undefined,
      done: () => document.querySelector('[role="dialog"][aria-label^="Peeking at"]') !== null,
    }),
    task({
      id: 'keep-traitor',
      task: 'Keep one',
      detail:
        'Your faction’s rules say how many traitors you keep; most keep one. Drag the one you keep to the front of the peek, close it, then right-click the pile and choose Draw a card. The rest stay face down on the table.',
      anchor: { kind: 'table', point: () => at(myTraitors()) },
      begin: () => undefined,
      done: () => traitorsInHand() === 1,
    }),
    task({
      id: 'ready',
      task: 'Say you are ready',
      detail:
        'Traitor selection waits for every player. Press Ready, top right; the count beside it climbs as the others confirm.',
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Ready')) ?? null,
      },
      begin: () => ({ stop: othersReadyUp(players) }),
      done: () => (snapshot().controls?.seats ?? []).every((seat) => snapshot().controls?.ready.includes(seat)),
      finish: (watch: { stop: () => void }) => watch.stop(),
    }),
    task({
      id: 'to-troops',
      task: 'Move on to the starting troops',
      detail:
        'With everyone ready, press Next phase. The board shows, and the Setup window lists where each faction starts.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => setupIndex() >= 2,
    }),
    task({
      id: 'troops',
      task: 'Place a starting troop',
      detail:
        'Your line leads the Setup window: the Bene Gesserit start with one troop in the Polar Sink, the board’s centre. Drag a troop from your reserves, where the arrow points, onto it.',
      anchor: { kind: 'table', point: () => at(myReserves()) },
      begin: myTroopsOnBoard,
      done: (start) => myTroopsOnBoard() > start,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The Setup window runs setup step by step, and the header names the step',
  'A prediction locks in the Setup window and becomes a card in your hand',
  'Your hand holds your leaders, your alliance card and your faction’s Extras',
  'Traitors come face down in front of your seat: peek at them and draw the ones you keep',
  'Steps that wait for everyone need Ready before Next phase',
];

export const setup: ChapterScript = { slug: 'setup', checkpoint: 'setup', tasks, learned };
