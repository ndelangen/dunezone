import { z } from 'zod';

import type { playStageSchema } from './admission';
import { phaseAt } from './phases';
import { tableCountSchema, tableIdSchema } from './schema';
import type { TableRoster } from './schema';

/** Retained built-in declarations; authoring defaults and custom phase composition have their own delivery. */
export const setupDeclarationSchema = z.object({
  id: tableIdSchema,
  name: z.literal('prediction'),
  title: z.string().min(1).max(160),
  instructions: z.string().max(8000),
  symbol: z.string().min(1).max(2048),
});
const setupStepSchema = z.object({
  id: tableIdSchema,
  kind: z.enum(['prediction', 'traitors', 'forces']),
  factionId: tableIdSchema.optional(),
  title: z.string(),
  instructions: z.string(),
  symbol: z.string(),
});
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

export function setupReadyRequired(setup: SetupState) {
  return setupStep(setup)?.kind !== 'prediction';
}

type PhaseGateInput = {
  stage?: z.infer<typeof playStageSchema>;
  setup?: SetupState;
  phase: number;
  roster?: TableRoster;
  ready: readonly string[];
  seats: readonly string[];
  predictions?: z.infer<typeof predictionsSchema>;
};

/**
 * Whether Next may advance the phase: the Worker refuses with `refusal`, and the view disables Next on it.
 * The Worker passes its private predictions and a view its public ones.
 * The gate reads only whether the current step holds one.
 */
export function phaseGate({ stage, setup, phase, roster, ready, seats, predictions }: PhaseGateInput) {
  const allReady = seats.length > 0 && seats.every((seat) => ready.includes(seat));
  if (stage !== 'setup' || !setup) {
    const needsReady = phaseAt(phase).id === 'mentat-pause';
    return {
      needsReady,
      refusal: needsReady && !allReady ? 'Every seated player must be ready before advancing.' : null,
    };
  }
  if (!setupReadyRequired(setup)) {
    const locked = Boolean(predictions?.[setupStep(setup).id]);
    return { needsReady: false, refusal: locked ? null : 'Lock the required prediction before advancing.' };
  }
  const full = roster?.seats.every((seat) => seats.includes(seat.id));
  return {
    needsReady: true,
    refusal: full && allReady ? null : 'Every fixed seat must be occupied and ready before advancing.',
  };
}
