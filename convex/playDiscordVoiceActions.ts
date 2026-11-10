'use node';

import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { discordCooldown } from './lib/discordCooldown';
import { DiscordFailure, DiscordPaused, DiscordRest, discordConfiguration } from './lib/discordRest';
import { discordVoiceSnapshot } from './lib/discordVoiceSnapshot';
import type { VoiceSnapshot } from './lib/discordVoiceSnapshot';
import { VOICE_BATCH, voiceCandidateValidator } from './lib/playDiscordVoice';

type VoiceCandidate = Infer<typeof voiceCandidateValidator>;

/** Permission and transport failures leave occupancy unknown; only a definite missing channel can retire. */
async function probeMissing(rest: DiscordRest, id: string): Promise<'missing' | 'unknown' | 'stop'> {
  try {
    await rest.request('GET', `/channels/${id}`);
    return 'unknown';
  } catch (error) {
    if (error instanceof DiscordPaused) {
      return 'stop';
    }
    if (!(error instanceof DiscordFailure)) {
      return 'unknown';
    }
    if (error.status === 429) {
      return 'stop';
    }
    return error.status === 404 && error.code === 10_003 ? 'missing' : 'unknown';
  }
}

/** Missing from a snapshot can mean hidden by permissions. Only Discord's specific unknown-channel response is terminal. */
async function confirmedMissing(rest: DiscordRest, missing: string[], deadline: number) {
  const confirmed: string[] = [];
  let cursor = 0;
  let stopped = false;
  await Promise.all(
    Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (cursor < missing.length) {
        if (stopped || Date.now() >= deadline) {
          return;
        }
        const id = missing[cursor++];
        const outcome = await probeMissing(rest, id);
        if (outcome === 'stop') {
          stopped = true;
          return;
        }
        if (outcome === 'missing') {
          confirmed.push(id);
        }
      }
    })
  );
  return confirmed;
}

/** Confirm exceptional missing targets before passing the fresh observation to the fenced deletion mutation. */
async function retireSnapshotChannels(
  ctx: ActionCtx,
  rest: DiscordRest,
  channels: VoiceCandidate[],
  snapshot: VoiceSnapshot,
  deadline: number
) {
  const observedAt = Date.now();
  const empty = new Set(snapshot.empty);
  const missing = new Set(await confirmedMissing(rest, snapshot.missing, deadline));
  if (empty.size === 0 && missing.size === 0) {
    return;
  }
  await ctx.runMutation(internal.playDiscordVoice.reportEmpty, {
    channels: channels.filter((channel) => empty.has(channel.discordChannelId)),
    missingChannels: channels.filter((channel) => missing.has(channel.discordChannelId)),
    observedAt,
  });
}

/** Hourly occupancy cleanup has no resident connection, reconnect loop, or external token handoff. */
export const cleanup = internalAction({
  args: { channels: v.array(voiceCandidateValidator) },
  returns: v.null(),
  handler: async (ctx, { channels }) => {
    const config = discordConfiguration();
    if (!config) {
      return null;
    }
    if (channels.length === 0 || channels.length > VOICE_BATCH) {
      return null;
    }
    const deadline = Date.now() + 25_000;
    const rest = new DiscordRest(config.token, 'Dune Play hourly voice cleanup', discordCooldown(ctx), deadline);
    try {
      const discovery = await rest.request('GET', '/gateway/bot');
      if (
        (await ctx.runQuery(internal.playDiscordRateLimits.inspect, { route: 'gatewayBot.read', major: 'none' })) ===
        null
      ) {
        return null;
      }
      const snapshot = await discordVoiceSnapshot(config.token, discovery, channels, deadline, (reason) => {
        console.warn('Discord voice cleanup snapshot was unavailable.', { operation: 'voice-cleanup', reason });
      });
      if (snapshot === null) {
        return null;
      }
      await retireSnapshotChannels(ctx, rest, channels, snapshot, deadline);
    } catch (error) {
      console.error('Discord voice cleanup could not finish.', {
        operation: 'voice-cleanup',
        ...(error instanceof DiscordFailure ? { status: error.status, code: error.code } : {}),
      });
    }
    return null;
  },
});
