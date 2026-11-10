import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import type { DiscordRequestGate } from './discordRest';

/** All Discord actions use the same persisted request gate and rate-limit observations. */
export function discordCooldown(ctx: ActionCtx): DiscordRequestGate {
  return {
    inspect: (scope) => ctx.runQuery(internal.playDiscordRateLimits.inspect, scope),
    observe: (observation) => ctx.runMutation(internal.playDiscordRateLimits.observe, observation),
  };
}
