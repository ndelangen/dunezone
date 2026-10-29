import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, buttonIn, closePieceMenu, closeUpShown, nextPhaseButton, onBoard, task, viaCompass } from './guideChecks';

/*
 * "Setup": the game's setup steps as the Setup window runs them, from the Bene Gesserit prediction to the starting troops.
 * The learner plays the Bene Gesserit, the one faction in the shared setup with a prediction, so the chapter opens on it.
 * Then the learner combines and shuffles the tabletop traitors, deals four, keeps one and clears the discards,
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
  const traitorPiles = () => pieces().filter(isTraitorPile);
  const tabletopTraitors = () => traitorPiles().reduce((total, pile) => total + pile.items.length, 0);
  const combined = () => (traitorPiles().length === 1 ? traitorPiles()[0] : undefined);
  const myName = () =>
    snapshot().roster?.seats.find((seat) => seat.faction?.id === mine())?.faction?.name ?? 'your faction';
  const gatheredSince = (seen: number) =>
    players
      .acceptedActions()
      .slice(seen)
      .some(({ action }) => action.kind === 'traitors-gather');
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
        'Press {H} to open Hand & spice. Your prediction is here, along with your leaders, alliance card and faction extras.\n\nHold {Alt} over your prediction card to read it. Release {Alt} when you are done.',
      anchor: { kind: 'page', element: viaCompass('hand') },
      ...closeUpShown('[data-piece-close-up][data-piece-type="card-prediction"]'),
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
      id: 'gather-traitors',
      task: 'Combine the traitor cards',
      detail:
        'Each faction brought its traitor cards. First we need one deck.\n\nIn the Setup window, press Gather tabletop traitors to combine the piles.',
      anchor: { kind: 'page', element: () => buttonIn('setup', 'Gather tabletop traitors')() ?? viaCompass('setup')() },
      begin: () => ({ seen: players.acceptedActions().length, count: tabletopTraitors() }),
      done: ({ seen, count }) => count > 0 && gatheredSince(seen) && combined()?.items.length === count,
    }),
    task({
      id: 'shuffle-traitors',
      task: 'Shuffle the traitor deck',
      detail:
        'Close Hand & spice so you can see the combined deck. Hover over it and press {R} to shuffle. Everyone should get a surprise!',
      anchor: { kind: 'table', point: () => at(combined()) },
      begin: () => players.acceptedActions().length,
      done: (seen) =>
        players
          .acceptedActions()
          .slice(seen)
          .some(({ action, source }) => action.kind === 'deck-shuffle' && source && isTraitorPile(source)),
    }),
    task({
      id: 'deal-traitors',
      task: 'Deal yourself four traitors',
      get detail() {
        return `The Setup window has Deal 1 and Deal 4 buttons beside each faction.\n\nPress Deal 4 beside ${myName()} to give yourself four cards. If you deal too many, drag the extras back onto the table until four remain.`;
      },
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(`[data-window="setup"] button[aria-label="Deal 4 to ${CSS.escape(myName())}"]`) ??
          viaCompass('setup')(),
      },
      begin: () => players.acceptedActions().length,
      done: (seen) =>
        traitorsInHand() === 4 &&
        players
          .acceptedActions()
          .slice(seen)
          .some(
            ({ action, source }) =>
              action.kind === 'deck-draw' &&
              action.count === 4 &&
              (!action.recipient || action.recipient === mine()) &&
              source &&
              isTraitorPile(source)
          ),
    }),
    task({
      id: 'keep-traitor',
      task: 'Choose your traitor',
      detail:
        'Open Hand & spice with {H} and have a look at your four traitors. Hold {Alt} over a card to read it.\n\nKeep one you like and drag the other three onto the table. They land face down, so your choice stays secret.',
      anchor: { kind: 'page', element: () => document.querySelector('[data-window="hand"]') ?? viaCompass('hand')() },
      begin: tabletopTraitors,
      done: (count) => traitorsInHand() === 1 && tabletopTraitors() >= count + 3,
    }),
    task({
      id: 'gather-discards',
      task: 'Gather the leftover traitors',
      detail:
        'Back in the Setup window, press Gather tabletop traitors again. It collects the discarded and undealt cards into one pile, leaving your chosen traitor in hand.',
      anchor: { kind: 'page', element: () => buttonIn('setup', 'Gather tabletop traitors')() ?? viaCompass('setup')() },
      begin: () => ({ seen: players.acceptedActions().length, count: tabletopTraitors() }),
      done: ({ seen, count }) => count > 0 && gatheredSince(seen) && combined()?.items.length === count,
    }),
    task({
      id: 'delete-discards',
      task: 'Delete the leftover pile',
      detail:
        'The leftover traitors can leave the game now. Right-click the gathered pile and hold the trash icon until the countdown ends.\n\nCareful: deletion is permanent. Make sure you have kept your chosen traitor before deleting the pile.',
      anchor: { kind: 'table', point: () => at(combined()) },
      begin: () => ({ seen: players.acceptedActions().length, id: combined()?.id }),
      done: ({ seen, id }) =>
        !!id &&
        traitorsInHand() === 1 &&
        tabletopTraitors() === 0 &&
        players
          .acceptedActions()
          .slice(seen)
          .some(({ action }) => action.kind === 'delete' && action.pieceId === id),
      finish: closePieceMenu,
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
  'Gather and shuffle the traitor cards, then use the phase panel to deal four',
  'Keep one traitor, discard three, gather the leftovers and delete their pile',
  'Steps that wait for everyone need Ready before Next phase',
];

export const setup: ChapterScript = { slug: 'setup', checkpoint: 'setup', tasks, learned };
