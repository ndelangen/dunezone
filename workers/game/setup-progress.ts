import { randomInt } from 'node:crypto';

import type { FactionCapture } from '../../src/shared/play/capture';
import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { TablePiece } from '../../src/shared/play/model';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { PieceAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { phaseGate, setupStep, setupReadyRequired } from '../../src/shared/play/setup';
import type { SetupState } from '../../src/shared/play/setup';
import { OTHER_DECK_POSITION } from '../../src/shared/play/tableFurnitureLayout';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
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
  return nextSnapshot(snapshot, accepted(tableForViewer(snapshot, SPECTATOR_SEAT), command, message));
}

function retainedFaction(snapshot: StoredSnapshot, id: string) {
  return snapshot.roster?.seats.find((seat) => seat.faction?.id === id)?.faction;
}

function factionName(snapshot: StoredSnapshot, id: string) {
  return retainedFaction(snapshot, id)?.name ?? id;
}

function setupControls(snapshot: StoredSnapshot) {
  return snapshot.controls ?? emptyPublicControls();
}

type Context = { factionId: string; seat: string; seats: string[]; reserved: ReadonlySet<string>; now: number };

/** The room supplies current seat authority; the caller commits the result with its receipt and history. */
export function setupCommand(snapshot: StoredSnapshot, action: PieceAction, context: Context): StoredSnapshot {
  switch (action.kind) {
    case 'prediction-lock':
      return lockPrediction(snapshot, action, context);
    case 'prediction-reveal':
      return revealPrediction(snapshot, action.stepId, context);
    case 'storm-random':
      return randomStorm(snapshot);
    case 'traitors-gather':
      return manualGather(snapshot, context);
    case 'ready':
      return readySetup(snapshot, action.ready, context);
    case 'phase':
      requireSetup(snapshot);
      return advanceSetup(snapshot, action.direction ?? 1, context);
    default:
      throw new GameRejection('That control is not available during setup.');
  }
}

function requireSetup(snapshot: StoredSnapshot) {
  if (snapshot.stage !== 'setup' || !snapshot.setup) {
    throw new GameRejection('This game is not in setup.');
  }
  return snapshot.setup;
}

function randomStorm(snapshot: StoredSnapshot) {
  if (snapshot.stage !== 'play' || snapshot.phase !== 0) {
    throw new GameRejection('Random storm placement is available only in Turn 1 Storm.');
  }
  return event(
    { ...snapshot, table: { ...snapshot.table, stormSectorIndex: randomInt(18) } },
    'storm-random',
    'The storm was placed in a random sector.'
  );
}

function manualGather(snapshot: StoredSnapshot, context: Context) {
  if (!snapshot.setup || !['setup', 'play'].includes(snapshot.stage!)) {
    throw new GameRejection('This game is not in setup or play.');
  }
  return gatherTraitors(snapshot, context.reserved, true);
}

function readySetup(snapshot: StoredSnapshot, value: boolean, context: Context) {
  if (!setupReadyRequired(requireSetup(snapshot))) {
    throw new GameRejection('Complete this setup action, then use Next phase.');
  }
  const controls = setupControls(snapshot);
  if (controls.ready.includes(context.seat) === value) {
    return snapshot;
  }
  const ready = controls.ready.filter((seat) => seat !== context.seat);
  if (value) {
    ready.push(context.seat);
  }
  return event(
    { ...snapshot, controls: { ...controls, ready } },
    'setup-ready',
    `${context.seat} ${value ? 'is ready' : 'withdrew readiness'}.`
  );
}

function predictionStep(snapshot: StoredSnapshot, stepId: string) {
  const step = setupStep(requireSetup(snapshot));
  if (step.id !== stepId || step.kind !== 'prediction') {
    throw new GameRejection('Only the current prediction phase may be locked.');
  }
  return step;
}

function requireRetainedFaction(snapshot: StoredSnapshot, id: string) {
  const retained = retainedFaction(snapshot, id);
  if (!retained) {
    throw new GameRejection('Choose a faction retained in this game.');
  }
}

function lockPrediction(
  snapshot: StoredSnapshot,
  action: Extract<PieceAction, { kind: 'prediction-lock' }>,
  context: Context
) {
  const step = predictionStep(snapshot, action.stepId);
  if (step.factionId !== context.factionId) {
    throw new GameRejection('Only the current player of this prediction phase may lock it.');
  }
  if (snapshot.privatePredictions[step.id]) {
    throw new GameRejection('This prediction is already locked.');
  }
  requireRetainedFaction(snapshot, action.choice.factionId);
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

function requirePhaseTiming(snapshot: StoredSnapshot, direction: -1 | 1, now: number) {
  const controls = setupControls(snapshot);
  if (now < controls.phaseChangedAt + PHASE_CHANGE_COOLDOWN_MS) {
    throw new GameRejection('Wait eight seconds between phase changes.');
  }
  if (direction < 0 && snapshot.setup!.index === 0) {
    throw new GameRejection('This is the first setup phase.');
  }
}

function completeSetupStep(snapshot: StoredSnapshot, direction: -1 | 1, reserved: ReadonlySet<string>) {
  if (direction < 0) {
    return snapshot;
  }
  const setup = snapshot.setup!;
  const step = setupStep(setup);
  if (step.kind !== 'traitors') {
    return snapshot;
  }
  if (setup.completed.includes(step.id)) {
    return snapshot;
  }
  return gatherTraitors(snapshot, reserved, true);
}

function nextSetupVisit(setup: SetupState, direction: -1 | 1) {
  const index = setup.index + direction;
  const finished = index === setup.steps.length;
  const step = setupStep(setup);
  return {
    finished,
    setup: {
      ...setup,
      index: finished ? setup.index : index,
      visit: setup.visit + 1,
      completed: direction > 0 ? [...new Set([...setup.completed, step.id])] : setup.completed,
      mapRevealed: setup.mapRevealed || (!finished && setup.steps[index].kind === 'forces'),
    },
  };
}

function advanceSetup(snapshot: StoredSnapshot, direction: -1 | 1, context: Context) {
  requirePhaseTiming(snapshot, direction, context.now);
  const controls = setupControls(snapshot);
  if (direction > 0) {
    const { refusal } = phaseGate({
      ...snapshot,
      ready: controls.ready,
      seats: context.seats,
      predictions: snapshot.privatePredictions,
    });
    if (refusal) {
      throw new GameRejection(refusal);
    }
  }
  const cleaned = completeSetupStep(snapshot, direction, context.reserved);
  const { setup, finished } = nextSetupVisit(snapshot.setup!, direction);
  return event(
    {
      ...cleaned,
      stage: finished ? 'play' : 'setup',
      phase: 0,
      setup,
      controls: { ...controls, ready: [], seats: context.seats, phaseChangedAt: context.now },
    },
    'setup-phase',
    finished ? 'Setup complete. Turn 1: Storm.' : `Setup: ${setupStep(setup).title}.`
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
  const { candidates, held } = pendingTraitors(snapshot.table.pieces, pending, reserved);
  const remaining = held ? [...pending] : [];
  const pieces = parkTraitors(snapshot.table.pieces, candidates);
  if (!pieces && JSON.stringify(remaining) === JSON.stringify(snapshot.pendingTraitors)) {
    return snapshot;
  }
  return event(
    { ...snapshot, pendingTraitors: remaining, table: { ...snapshot.table, pieces: pieces ?? snapshot.table.pieces } },
    'traitors-gather',
    'Tabletop traitors gathered below the tanks. Private hands are unchanged.'
  );
}

function parkedTraitors(candidates: TablePiece[]) {
  if (candidates.length !== 1) {
    return false;
  }
  const piece = candidates[0];
  return (
    piece.position[0] === OTHER_DECK_POSITION[0] &&
    piece.position[2] === OTHER_DECK_POSITION[2] &&
    piece.orientation === 0
  );
}

function parkTraitors(table: TablePiece[], candidates: TablePiece[]) {
  if (!candidates.length || parkedTraitors(candidates)) {
    return null;
  }
  const ids = new Set(candidates.map((piece) => piece.id));
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
  return [...table.filter((piece) => !ids.has(piece.id)), deck];
}

function pendingTraitors(table: TablePiece[], pending: ReadonlySet<string>, reserved: ReadonlySet<string>) {
  const candidates: TablePiece[] = [];
  let held = false;
  for (const piece of table.filter(isTraitor)) {
    if (!piece.items.some((item) => pending.has(item.id))) {
      continue;
    }
    if (reserved.has(piece.id)) {
      held = true;
    } else {
      candidates.push(piece);
    }
  }
  return { candidates, held };
}
