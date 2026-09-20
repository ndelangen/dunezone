import { z } from 'zod';

import { tableCountSchema, tableIdSchema } from './schema';

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

export function setupStep(setup: SetupState) {
  return setup.steps[setup.index];
}

export function setupMapVisible(setup?: SetupState) {
  return setup !== undefined && (setup.mapRevealed || setupStep(setup)?.kind === 'forces');
}

export function setupReadyRequired(setup: SetupState) {
  return setupStep(setup)?.kind !== 'prediction';
}
