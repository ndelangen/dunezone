import { z } from 'zod';

import { alphanumericNameSchema } from '@app/validation/names';

const groupNameSchema = alphanumericNameSchema('Group name');

export const groupInputSchema = z.strictObject({
  name: groupNameSchema,
});
