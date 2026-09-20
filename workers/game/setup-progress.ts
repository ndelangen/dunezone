import { randomInt } from 'node:crypto';

import type { FactionCapture } from '../../src/shared/play/capture';
import { nextSnapshot } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { TablePiece } from '../../src/shared/play/model';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { PieceAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { setupStep, setupReadyRequired } from '../../src/shared/play/setup';
import type { SetupState } from '../../src/shared/play/setup';
import { OTHER_DECK_POSITION } from '../../src/shared/play/tableFurnitureLayout';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { appendEvent, eventId } from '../../src/shared/play/tableState';
import type { StoredSnapshot } from './state';

export function initialSetup(captures: FactionCapture[]): SetupState {
  return {
    steps: [
      ...captures.flatMap((capture, factionIndex) =>
        (capture.setupPhases ?? []).map((declaration, index) => ({
          id: `prediction-${factionIndex}-${index}`,
          kind: declaration.name,
          factionId: capture.faction.id,
          title: declaration.title,
          instructions: declaration.instructions,
          symbol: declaration.symbol,
        }))
      ),
      {
        id: 'traitors',
        kind: 'traitors',
        title: 'Traitor selection',
        instructions:
          'Combine, shuffle and deal traitor cards. Return unwanted cards to the table, then confirm Ready.',
        symbol: '/vector/icon/traitor.svg',
      },
      {
        id: 'forces',
        kind: 'forces',
        title: 'Starting forces',
        instructions:
          'Place your starting forces using your faction instructions. When every player is prepared, Ready enables Next into Turn 1 Storm.',
        symbol: '/vector/icon/shipment_disc.svg',
      },
    ],
    index: 0,
    visit: 1,
    mapRevealed: false,
    completed: [],
    instructions: captures.map((capture) => ({
      factionId: capture.faction.id,
      text: capture.definition.rules.startText,
    })),
  };
}

function event(snapshot: StoredSnapshot, command: string, message: string): StoredSnapshot {
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  return nextSnapshot(snapshot, {
    ...table,
    ...appendEvent(table, { id: eventId(table.nextEventNumber), command, message, status: 'accepted' }),
  });
}

function factionName(snapshot: StoredSnapshot, id: string) {
  return snapshot.roster?.seats.find((seat) => seat.faction?.id === id)?.faction?.name ?? id;
}

type Context = { factionId: string; seat: string; seats: string[]; reserved: ReadonlySet<string>; now: number };

/** The room supplies current seat authority; the caller commits the result with its receipt and history. */
export function setupCommand(snapshot: StoredSnapshot, action: PieceAction, context: Context): StoredSnapshot {
  if (action.kind === 'prediction-lock') {
    return lockPrediction(snapshot, action, context);
  }
  if (action.kind === 'prediction-reveal') {
    return revealPrediction(snapshot, action.stepId, context);
  }
  if (action.kind === 'storm-random') {
    if (snapshot.stage !== 'play' || snapshot.phase !== 0) {
      throw new GameRejection('Random storm placement is available only in Turn 1 Storm.');
    }
    return event(
      { ...snapshot, table: { ...snapshot.table, stormSectorIndex: randomInt(18) } },
      action.kind,
      'The storm was placed in a random sector.'
    );
  }
  if (action.kind === 'traitors-gather' && snapshot.setup && ['setup', 'play'].includes(snapshot.stage!)) {
    return gatherTraitors(snapshot, context.reserved, true);
  }
  const setup = snapshot.setup;
  if (snapshot.stage !== 'setup' || !setup) {
    throw new GameRejection('This game is not in setup.');
  }
  if (action.kind === 'ready') {
    if (!setupReadyRequired(setup)) {
      throw new GameRejection('Complete this setup action, then use Next phase.');
    }
    const controls = snapshot.controls ?? emptyPublicControls();
    const ready = controls.ready.filter((seat) => seat !== context.seat);
    if (action.ready) {
      ready.push(context.seat);
    }
    return event(
      { ...snapshot, controls: { ...controls, ready } },
      'setup-ready',
      `${context.seat} ${action.ready ? 'is ready' : 'withdrew readiness'}.`
    );
  }
  if (action.kind !== 'phase') {
    throw new GameRejection('That control is not available during setup.');
  }
  return advanceSetup(snapshot, action.direction ?? 1, context);
}

function lockPrediction(
  snapshot: StoredSnapshot,
  action: Extract<PieceAction, { kind: 'prediction-lock' }>,
  context: Context
) {
  const step = snapshot.setup && setupStep(snapshot.setup);
  if (
    snapshot.stage !== 'setup' ||
    step?.id !== action.stepId ||
    step.kind !== 'prediction' ||
    step.factionId !== context.factionId
  ) {
    throw new GameRejection('Only the current player of this prediction phase may lock it.');
  }
  if (snapshot.privatePredictions[step.id]) {
    throw new GameRejection('This prediction is already locked.');
  }
  if (!snapshot.roster?.seats.some((seat) => seat.faction?.id === action.choice.factionId)) {
    throw new GameRejection('Choose a faction retained in this game.');
  }
  return event(
    {
      ...snapshot,
      privatePredictions: {
        ...snapshot.privatePredictions,
        [step.id]: { factionId: context.factionId, choice: action.choice, lockedAt: context.now, revealedAt: null },
      },
    },
    action.kind,
    `${factionName(snapshot, context.factionId)} locked its prediction.`
  );
}

function revealPrediction(snapshot: StoredSnapshot, stepId: string, context: Context) {
  const prediction = snapshot.privatePredictions[stepId];
  if (!prediction || prediction.factionId !== context.factionId) {
    throw new GameRejection('Only the current player of this faction may reveal its locked prediction.');
  }
  if (prediction.revealedAt !== null) {
    throw new GameRejection('This prediction is already revealed.');
  }
  const revealed = { ...prediction, revealedAt: context.now };
  return event(
    { ...snapshot, privatePredictions: { ...snapshot.privatePredictions, [stepId]: revealed } },
    'prediction-reveal',
    `${factionName(snapshot, context.factionId)} revealed its prediction: ${factionName(snapshot, prediction.choice.factionId)}, turn ${prediction.choice.turn}.`
  );
}

function requireAdvance(snapshot: StoredSnapshot, context: Context) {
  const setup = snapshot.setup!;
  const step = setupStep(setup);
  if (step.kind === 'prediction' && !snapshot.privatePredictions[step.id]) {
    throw new GameRejection('Lock the required prediction before advancing.');
  }
  if (setupReadyRequired(setup)) {
    const controls = snapshot.controls ?? emptyPublicControls();
    const full = snapshot.roster?.seats.every((seat) => context.seats.includes(seat.id));
    if (!full || !context.seats.every((seat) => controls.ready.includes(seat))) {
      throw new GameRejection('Every fixed seat must be occupied and ready before advancing.');
    }
  }
}

function advanceSetup(snapshot: StoredSnapshot, direction: -1 | 1, context: Context) {
  const setup = snapshot.setup!;
  const controls = snapshot.controls ?? emptyPublicControls();
  if (context.now < controls.phaseChangedAt + PHASE_CHANGE_COOLDOWN_MS) {
    throw new GameRejection('Wait eight seconds between phase changes.');
  }
  if (direction < 0 && setup.index === 0) {
    throw new GameRejection('This is the first setup phase.');
  }
  if (direction > 0) {
    requireAdvance(snapshot, context);
  }
  const step = setupStep(setup);
  const cleaned =
    direction > 0 && step.kind === 'traitors' && !setup.completed.includes(step.id)
      ? gatherTraitors(snapshot, context.reserved, true)
      : snapshot;
  const index = setup.index + direction;
  const finished = index === setup.steps.length;
  const completed = direction > 0 ? [...new Set([...setup.completed, step.id])] : setup.completed;
  return event(
    {
      ...cleaned,
      stage: finished ? 'play' : 'setup',
      phase: 0,
      setup: {
        ...setup,
        index: finished ? setup.index : index,
        visit: setup.visit + 1,
        completed,
        mapRevealed: setup.mapRevealed || (!finished && setup.steps[index].kind === 'forces'),
      },
      controls: { ...controls, ready: [], seats: context.seats, phaseChangedAt: context.now },
    },
    'setup-phase',
    finished ? 'Setup complete. Turn 1: Storm.' : `Setup: ${setup.steps[index].title}.`
  );
}

function isTraitor(piece: TablePiece) {
  return piece.kind === 'card' && piece.stackKey === 'cards:traitor' && !piece.inventory;
}

/** Reserved sources stay untouched until their carry ends; the remaining identities are retained for deferred cleanup. */
export function gatherTraitors(snapshot: StoredSnapshot, reserved: ReadonlySet<string>, start = false): StoredSnapshot {
  const pending = new Set(
    start
      ? snapshot.table.pieces.filter(isTraitor).flatMap((piece) => piece.items.map((item) => item.id))
      : snapshot.pendingTraitors
  );
  if (!pending.size) {
    return snapshot;
  }
  const candidates = snapshot.table.pieces.filter(
    (piece) => isTraitor(piece) && !reserved.has(piece.id) && piece.items.some((item) => pending.has(item.id))
  );
  const held = snapshot.table.pieces
    .filter((piece) => isTraitor(piece) && reserved.has(piece.id))
    .flatMap((piece) => piece.items.filter((item) => pending.has(item.id)).map((item) => item.id));
  const remaining = held.length ? [...pending] : [];
  const alreadyParked =
    candidates.length === 1 &&
    candidates[0].position[0] === OTHER_DECK_POSITION[0] &&
    candidates[0].position[2] === OTHER_DECK_POSITION[2] &&
    candidates[0].orientation === 0;
  if ((!candidates.length || alreadyParked) && JSON.stringify(remaining) === JSON.stringify(snapshot.pendingTraitors)) {
    return snapshot;
  }
  const ids = new Set(candidates.map((piece) => piece.id));
  const pieces = snapshot.table.pieces.filter((piece) => !ids.has(piece.id));
  if (candidates.length) {
    const deck = {
      ...candidates[0],
      label: 'Traitor deck',
      owner: 'shared',
      locked: false,
      orientation: 0,
      zoneId: null,
      items: candidates.flatMap((piece) => piece.items),
    };
    deck.position = restingPositionAt(OTHER_DECK_POSITION, deck);
    pieces.push(deck);
  }
  return event(
    { ...snapshot, pendingTraitors: remaining, table: { ...snapshot.table, pieces } },
    'traitors-gather',
    'Tabletop traitors gathered below the tanks. Private hands are unchanged.'
  );
}
