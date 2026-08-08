import { z } from 'zod';

import { alphanumericNameSchema } from '@app/validation/names';

const rulesetNameSchema = alphanumericNameSchema('Ruleset name');

export const rulesetInputSchema = z.strictObject({
  name: rulesetNameSchema,
});
