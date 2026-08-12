import { alphanumericNameSchema } from '@shared/validation/names';
import { z } from 'zod';

const groupNameSchema = alphanumericNameSchema('Group name');

export const groupInputSchema = z.strictObject({
  name: groupNameSchema,
});
