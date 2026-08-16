import { alphanumericNameSchema } from '@shared/validation/names';
import { z } from 'zod';

const rulesetNameSchema = alphanumericNameSchema('Ruleset name');

/**
 * Free prose, so no upper bound — the FAQ's question and answer schemas set that precedent.
 * The floor is deliberate: a description shorter than this says nothing a reader could not get from the name.
 */
const rulesetDescriptionSchema = z.string().trim().min(50, 'Ruleset description must be at least 50 characters');

/**
 * `description` is optional here only for the widen phase of `rulesets_description_v1`: rows that predate the field carry an empty string, and no caller may be forced to invent 50 characters to change a ruleset's name.
 * It narrows to required once the backfill has run in production.
 */
export const rulesetInputSchema = z.strictObject({
  name: rulesetNameSchema,
  description: rulesetDescriptionSchema.optional(),
});
