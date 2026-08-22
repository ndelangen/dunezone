import { alphanumericNameSchema } from '@shared/validation/names';
import { z } from 'zod';

const rulesetNameSchema = alphanumericNameSchema('Ruleset name');

/**
 * Free prose, so no upper bound, the FAQ's question and answer schemas set that precedent.
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
 * Every ruleset write carries both fields.
 * There is no grace for rows that predate the description: a ruleset still holding the backfilled empty string cannot be saved at all until someone writes one, and both ruleset forms enforce that before submitting.
 */
export const rulesetInputSchema = z.strictObject({
  name: rulesetNameSchema,
  description: rulesetDescriptionSchema,
});

/** The authored shape, derived from the schema so the two can never disagree. */
export type RulesetInput = z.infer<typeof rulesetInputSchema>;
