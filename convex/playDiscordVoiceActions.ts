'use node';

import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { DiscordFailure, DiscordPaused, DiscordRest, discordConfiguration } from './lib/discordRest';
import { discordVoiceSnapshot } from './lib/discordVoiceSnapshot';
import { VOICE_BATCH, voiceCandidateValidator } from './lib/playDiscordVoice';

/** Missing from a snapshot can mean hidden by permissions. Only Discord's specific unknown-channel response is terminal. */
async function confirmedMissing(rest: DiscordRest, missing: string[], deadline: number) {
  const confirmed: string[] = [];
  let cursor = 0;
  let stopped = false;
  await Promise.all(
    Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (!stopped && cursor < missing.length && Date.now() < deadline) {
        const id = missing[cursor++];
        try {
          await rest.request('GET', `/channels/${id}`, undefined, 0);
        } catch (error) {
          if (error instanceof DiscordPaused || (error instanceof DiscordFailure && error.status === 429)) {
            stopped = true;
          }
          if (error instanceof DiscordFailure && error.status === 404 && error.code === 10_003) {
            confirmed.push(id);
          }
        }
      }
    })
  );
  return confirmed;
}

/** Hourly occupancy cleanup has no resident connection, reconnect loop, or external token handoff. */
export const cleanup = internalAction({
  args: { channels: v.array(voiceCandidateValidator) },
  returns: v.null(),
  handler: async (ctx, { channels }) => {
    const config = discordConfiguration();
    if (!config || channels.length === 0 || channels.length > VOICE_BATCH) {
      return null;
    }
    const deadline = Date.now() + 25_000;
    const rest = new DiscordRest(
      config.token,
      'Dune Play hourly voice cleanup',
      {
        until: () => ctx.runQuery(internal.playDiscord.cooldownUntil, {}),
        hold: (until) => ctx.runMutation(internal.playDiscord.holdRequests, { until }),
      },
      deadline
    );
    try {
      const discovery = await rest.request('GET', '/gateway/bot', undefined, 0);
      if ((await ctx.runQuery(internal.playDiscord.cooldownUntil, {})) === null) {
        return null;
      }
      const snapshot = await discordVoiceSnapshot(config.token, discovery, channels, deadline, (reason) => {
        console.warn('Discord voice cleanup snapshot was unavailable.', { operation: 'voice-cleanup', reason });
      });
      if (snapshot !== null) {
        const observedAt = Date.now();
        const retired = [...snapshot.empty, ...(await confirmedMissing(rest, snapshot.missing, deadline))];
        await ctx.runMutation(internal.playDiscordVoice.reportEmpty, {
          channels: channels.filter((channel) => retired.includes(channel.discordChannelId)),
          observedAt,
        });
      }
    } catch (error) {
      console.error('Discord voice cleanup could not finish.', {
        operation: 'voice-cleanup',
        ...(error instanceof DiscordFailure ? { status: error.status, code: error.code } : {}),
      });
    }
    return null;
  },
});
