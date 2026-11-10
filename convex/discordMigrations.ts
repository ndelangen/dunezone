import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import schema from './schema';

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'discordMigrations:',
  schema,
});

/** Preserve the creator even when the game or creator has already been removed. */
export const discord_channel_creators_v1 = migrations.define({
  table: 'play_game_discord_channels',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (row.creator_id !== undefined) return;
    const game = await ctx.db.get(row.game_id);
    await ctx.db.patch(row._id, { creator_id: game?.creator_id ?? null });
  },
});

export const discord_channel_creators_verify_v1 = migrations.define({
  table: 'play_game_discord_channels',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    if (row.creator_id === undefined) throw new Error('Discord channel creator has not been backfilled.');
  },
});

export const DISCORD_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  discord_channel_creators_v1: internal.discordMigrations.discord_channel_creators_v1,
  discord_channel_creators_verify_v1: internal.discordMigrations.discord_channel_creators_verify_v1,
};
