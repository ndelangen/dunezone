import type { QueryCtx } from '../_generated/server';
import { discordConfiguration } from './discordRest';

/** Missing settings preserve the configured deployment's existing behaviour. */
export async function discordEnabled(ctx: QueryCtx) {
  if (!discordConfiguration()) {
    return false;
  }
  return (await ctx.db.query('play_discord_settings').unique())?.enabled ?? true;
}
