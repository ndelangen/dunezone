import { alphanumericNameSchema } from '@shared/validation/names';
import { z } from 'zod';

const rulesetNameSchema = alphanumericNameSchema('Ruleset name');

export const rulesetInputSchema = z.strictObject({
  name: rulesetNameSchema,
});
