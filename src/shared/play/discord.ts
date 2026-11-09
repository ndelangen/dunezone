import { z } from 'zod';

export const playDiscordRequestSchema = z.discriminatedUnion('state', [
  z.object({ id: z.string(), state: z.literal('pending') }),
  z.object({ id: z.string(), state: z.literal('ready'), url: z.string(), kind: z.enum(['channel', 'invite']) }),
  z.object({ id: z.string(), state: z.literal('error'), message: z.string() }),
]);

export const playDiscordMenuSchema = z.union([
  z.object({ kind: z.literal('connect'), profileSlug: z.string() }),
  z.object({ kind: z.literal('join'), request: playDiscordRequestSchema.nullable() }),
]);

export type PlayDiscordMenu = z.infer<typeof playDiscordMenuSchema>;
