import { z } from 'zod';

export function alphanumericNameSchema(label: string) {
  return z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]+$/, `${label} may only contain letters and numbers`)
    .min(1, `${label} is required`);
}
