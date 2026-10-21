import { z } from 'zod';

export const backgroundPresetKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9/-]*$/);
export const backgroundSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('preset'), key: backgroundPresetKeySchema }),
  z.strictObject({ kind: z.literal('custom') }),
  z.strictObject({ kind: z.literal('family') }),
]);
