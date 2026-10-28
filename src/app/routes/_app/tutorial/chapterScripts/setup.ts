import { factionTokenOf } from '@shared/play/factionToken';
import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, buttonIn, nextPhaseButton, onBoard, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * "Setup": the game's setup steps as the Setup window runs them, from the Bene Gesserit prediction to the starting troops.
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

/* A card in hand shows its face; a pile on the table lies face down, and the page sees only its back, so it goes by its stack. */
const isTraitor = (piece: { items: readonly { artwork?: { type?: string } }[] }) =>
  piece.items[0]?.artwork?.type === 'card-traitor';
const isTraitorPile = (piece: { stackKey?: string | null; items: readonly { artwork?: { backName?: string } }[] }) =>
  piece.stackKey === 'cards:traitor' || piece.items[0]?.artwork?.backName === 'Traitor';

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
      .filter(isTraitorPile)
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
  return [
    task({
      id: 'prediction',
      task: 'Make your prediction',
      detail:
        "You're playing Bene Gesserit, so you get a secret prediction! In the Setup window, choose a Predicted winner and Predicted turn, then press Lock prediction.\n\nOnly you can see it.",
      /* The faction to pick first, then the button once the choice is complete. */
      anchor: {
        kind: 'page',
        element: () => {
          const lock = buttonIn('setup', 'Lock prediction')();
          return lock && !lock.disabled ? lock : document.querySelector('[data-window="setup"] input');
        },
      },
      begin: () => undefined,
      done: predictionLocked,
    }),
    task({
      id: 'hand',
      task: 'Check your hand',
      detail:
        'Press {H} to open Hand & spice. Your prediction is here, along with your leaders, alliance card and faction extras.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...openedWindow(windowShown('hand')),
    }),
    task({
      id: 'to-traitors',
      task: 'Move on to Traitor selection',
      detail: 'Press Next phase in the top right to begin Traitor selection.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => setupIndex() >= 1,
    }),
    task({
      id: 'peek-traitors',
      task: 'Meet your traitors',
      detail:
        "Everyone has five face-down Traitor cards in front of them. Let's see yours.\n\nRight-click your pile and choose Peek at the deck. Only you can see the faces.",
      anchor: { kind: 'table', point: () => at(myTraitors()) },
      begin: () => undefined,
      done: () => document.querySelector('[role="dialog"][aria-label^="Peeking at"]') !== null,
    }),
    task({
      id: 'keep-traitor',
      task: 'Choose a traitor',
      detail:
        'See one you like? Drag it to the front of the row and close the peek. Then right-click your pile and choose Draw a card. The rest stay face down.\n\nMost factions keep one traitor, but check your faction rules.',
      anchor: { kind: 'table', point: () => at(myTraitors()) },
      begin: () => undefined,
      done: () => traitorsInHand() === 1,
    }),
    task({
      id: 'ready',
      task: 'Ready for the next step',
      detail:
        'Press Ready in the top right when you have chosen your traitor. Setup can continue once every player is ready.',
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
      detail: "Press Next phase. The Setup window now lists each faction's starting troops and territories.",
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => setupIndex() >= 2,
    }),
    task({
      id: 'troops',
      task: 'Place your first troop',
      detail:
        'Bene Gesserit start with one troop in the Polar Sink, at the centre of the board.\n\nDrag a troop there from your reserves.',
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
