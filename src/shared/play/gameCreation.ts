import { z } from 'zod';

import { playCreateGameRequestSchema } from './admission';
import { playCreateGameOutcomeSchema } from './seatLimit';

/** The server validates the custom wording before spending a provider request. */
export const playNamedGameRequestSchema = playCreateGameRequestSchema.extend({ name: z.string() });

const [created, refused] = playCreateGameOutcomeSchema.options;
/** Unavailable checking permits creation, without describing the name as approved. */
export const playNamedGameOutcomeSchema = z.union([
  created.extend({
    name: z.string(),
    slug: z.string(),
    moderation: z.enum(['no_profanity_detected', 'check_unavailable']),
  }),
  refused.extend({ reason: z.enum([...refused.shape.reason.options, 'invalid_name', 'profanity_detected']) }),
]);
