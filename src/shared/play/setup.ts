import { z } from 'zod';

import { phaseAt } from './phases';
import type { GameSnapshot } from './protocol';
import { tableCountSchema, tableIdSchema } from './schema';

const setupStepSchema = z.object({
  id: tableIdSchema,
  kind: z.enum(['prediction', 'instruction', 'traitors', 'forces']),
  factionId: tableIdSchema.optional(),
  title: z.string(),
  instructions: z.string(),
  symbol: z.string(),
  /* Traitors and forces set it, prediction clears it (its lock gates instead), an instruction step takes its declaration's; absent on steps stored before it existed. */
  allPlayersMustBeReady: z.boolean().optional(),
});
type SetupStep = z.infer<typeof setupStepSchema>;
export const setupStateSchema = z.object({
  steps: z.array(setupStepSchema).min(2),
  index: tableCountSchema,
  visit: tableCountSchema,
  mapRevealed: z.boolean().default(false),
  completed: z.array(tableIdSchema),
  instructions: z.array(z.object({ factionId: tableIdSchema, text: z.string() })),
});
export type SetupState = z.infer<typeof setupStateSchema>;
export const predictionChoiceSchema = z.object({ factionId: tableIdSchema, turn: tableCountSchema.min(1) });
export const predictionSchema = z.object({
  factionId: tableIdSchema,
  lockedAt: tableCountSchema,
  revealedAt: tableCountSchema.nullable(),
  choice: predictionChoiceSchema.optional(),
});
export const predictionsSchema = z.record(tableIdSchema, predictionSchema);
export const setupActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('prediction-lock'), stepId: tableIdSchema, choice: predictionChoiceSchema }),
  z.strictObject({ kind: z.literal('prediction-reveal'), stepId: tableIdSchema }),
  z.strictObject({ kind: z.literal('traitors-gather') }),
  z.strictObject({ kind: z.literal('storm-random') }),
]);
type SetupAction = z.infer<typeof setupActionSchema>;
const kinds: ReadonlySet<string> = new Set(setupActionSchema.options.map((option) => option.shape.kind.value));
export function isSetupAction(action: { kind: string }): action is SetupAction {
  return kinds.has(action.kind);
}

export function setupStep(setup: SetupState) {
  return setup.steps[setup.index];
}

export function setupMapVisible(setup?: SetupState) {
  return setup !== undefined && (setup.mapRevealed || setupStep(setup)?.kind === 'forces');
}

function stepNeedsReady(step: SetupStep) {
  return step.allPlayersMustBeReady ?? step.kind !== 'prediction';
}

export function setupReadyRequired(setup: SetupState) {
  const step = setupStep(setup);
  return step !== undefined && stepNeedsReady(step);
}

type PhaseGateInput = Pick<GameSnapshot, 'stage' | 'setup' | 'phase' | 'phases' | 'roster' | 'predictions'> & {
  ready: readonly string[];
  seats: readonly string[];
  /** The open battle, public or stored; while there is one the table stays in its phase. */
  battle?: object | null;
};

/**
 * Whether Next may advance the phase: the Worker refuses with `refusal`, and the view disables Next on it.
 * The Worker passes its private predictions and a view its public ones.
 * The gate reads only whether the current step holds one.
 */
export function phaseGate({ stage, setup, phase, phases, roster, ready, seats, predictions, battle }: PhaseGateInput) {
  const allReady = seats.length > 0 && seats.every((seat) => ready.includes(seat));
  if (stage !== 'setup' || !setup) {
    const needsReady = phaseAt(phase, phases).allPlayersMustBeReady;
    /* A battle left open past its phase would block every later battle, so the table waits for it to end. */
    if (battle) {
      return { needsReady, refusal: 'A battle is still open. Resolve or cancel it before moving to the next phase.' };
    }
    return {
      needsReady,
      refusal: needsReady && !allReady ? 'Every seated player must be ready before advancing.' : null,
    };
  }
  const step = setupStep(setup);
  if (step?.kind === 'prediction') {
    const locked = Boolean(predictions?.[step.id]);
    return { needsReady: false, refusal: locked ? null : 'Lock the required prediction before advancing.' };
  }
  if (!setupReadyRequired(setup)) {
    return { needsReady: false, refusal: null };
  }
  const full = roster?.seats.every((seat) => seats.includes(seat.id));
  return {
    needsReady: true,
    refusal: full && allReady ? null : 'Every fixed seat must be occupied and ready before advancing.',
  };
}
