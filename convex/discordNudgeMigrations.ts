import { Migrations } from '@convex-dev/migrations';
import { v } from 'convex/values';

import { components } from './_generated/api';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import schema from './schema';

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'discordNudgeMigrations:',
  schema,
});

/** Retires delivery records only; accounts, game rows and Discord channels are untouched. */
export const retire = migrations.define({
  table: 'play_game_discord_nudges',
  batchSize: 100,
  migrateOne: async (ctx, row) => {
    await ctx.db.delete(row._id);
  },
});

/** A bounded emptiness check for the later table-removal release. */
export const verifyRetired = internalQuery({
  args: {},
  returns: v.object({ empty: v.boolean() }),
  handler: async (ctx) => ({ empty: (await ctx.db.query('play_game_discord_nudges').first()) === null }),
});
