import { z } from 'zod';

export const loadProfileSchema = z.enum(['stacked', 'separated']);
export type LoadProfile = z.infer<typeof loadProfileSchema>;
