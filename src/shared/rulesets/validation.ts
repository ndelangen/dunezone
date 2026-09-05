import { alphanumericNameSchema } from '@shared/validation/names';
import { z } from 'zod';

import { proseFormattedTextSchema } from '../formattedText';

export const rulesetNameSchema = alphanumericNameSchema('Ruleset name');

/**
 * Free prose, so no upper bound;
 * the FAQ's question and answer schemas set that precedent.
 * The floor is deliberate: an About shorter than this says nothing a reader could not get from the name.
 */
export const RULESET_ABOUT_MIN_LENGTH = 50;

export const rulesetAboutSchema = z
  .string()
  .trim()
  .pipe(proseFormattedTextSchema)
  .pipe(
    z.string().min(RULESET_ABOUT_MIN_LENGTH, `Ruleset About must be at least ${RULESET_ABOUT_MIN_LENGTH} characters`)
  );

/**
 * Every ruleset write carries both fields.
 * There is no grace for a Ruleset that still holds the historical empty string: it cannot be saved until someone writes its About, and both forms enforce that before submitting.
 */
export const rulesetInputSchema = z.strictObject({
  name: rulesetNameSchema,
  about: rulesetAboutSchema,
});

/** The authored shape, derived from the schema so the two can never disagree. */
export type RulesetInput = z.infer<typeof rulesetInputSchema>;
