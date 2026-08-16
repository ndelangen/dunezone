import { alphanumericNameSchema } from '@shared/validation/names';
import { z } from 'zod';

const rulesetNameSchema = alphanumericNameSchema('Ruleset name');

/**
 * Free prose, so no upper bound — the FAQ's question and answer schemas set that precedent.
 * The floor is deliberate: a description shorter than this says nothing a reader could not get from the name.
 */
export const RULESET_DESCRIPTION_MIN_LENGTH = 50;

export const rulesetDescriptionSchema = z
  .string()
  .trim()
  .min(
    RULESET_DESCRIPTION_MIN_LENGTH,
    `Ruleset description must be at least ${RULESET_DESCRIPTION_MIN_LENGTH} characters`
  );

/**
 * `description` is optional here only for the widen phase of `rulesets_description_v1`, so that rows predating the field stay readable.
 * There is no grace for those rows on the way out: every write goes through the floor, which means a ruleset still holding the backfilled empty string cannot be saved at all until someone writes a description.
 * Both ruleset forms enforce that before submitting, and the field narrows to required once the backfill has run in production.
 */
export const rulesetInputSchema = z.strictObject({
  name: rulesetNameSchema,
  description: rulesetDescriptionSchema.optional(),
});
