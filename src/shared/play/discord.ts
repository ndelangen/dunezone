import { z } from 'zod';

export const playDiscordMenuSchema = z.object({ url: z.string() });

export type PlayDiscordMenu = z.infer<typeof playDiscordMenuSchema>;
