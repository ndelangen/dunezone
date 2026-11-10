import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { discordConfiguration, DiscordFailure, DiscordPaused, DiscordRest } from './lib/discordRest';
import { playCredentialDigest } from './lib/playAuthorization';

function classifyDeliveryFailure(error: unknown) {
  if (error instanceof DiscordPaused) {
    return { outcome: 'dropped' as const, error: undefined };
  }
  const uncertain = {
    outcome: 'uncertain' as const,
    error: 'The Discord ping has no confirmed result. It will not be sent again.',
  };
  if (!(error instanceof DiscordFailure)) {
    return uncertain;
  }
  const retryAfterMs = error.retryAfterMs;
  if (error.status === 429) {
    return { outcome: 'rate_limited' as const, error: error.message, retryAfterMs };
  }
  if (error.status >= 400 && error.status < 500) {
    return { outcome: 'failed' as const, error: error.message, retryAfterMs };
  }
  return { ...uncertain, retryAfterMs };
}

/** A nudge is optional and short-lived; an ambiguous POST is never replayed. */
export const deliver = internalAction({
  args: { id: v.id('play_game_discord_nudges'), nudgeId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const configuration = discordConfiguration();
    if (!configuration) {
      return null;
    }
    const work = await ctx.runMutation(internal.playDiscordNudges.start, args);
    if (!work) {
      return null;
    }
    const rest = new DiscordRest(configuration.token, 'Dune Play nudge', {
      until: () => ctx.runQuery(internal.playDiscord.cooldownUntil, {}),
      hold: (until) => ctx.runMutation(internal.playDiscord.holdRequests, { until }),
    });
    try {
      const nonce = (await playCredentialDigest(`${args.id}:${args.nudgeId}`)).slice(0, 24);
      const messageId = await rest.nudge(
        work.channelId,
        work.discordUserId,
        work.fromFactionName,
        work.gameName,
        nonce
      );
      await ctx.runMutation(internal.playDiscordNudges.settle, { ...args, outcome: 'sent', messageId });
    } catch (error) {
      await ctx.runMutation(internal.playDiscordNudges.settle, {
        ...args,
        ...classifyDeliveryFailure(error),
      });
    }
    return null;
  },
});
