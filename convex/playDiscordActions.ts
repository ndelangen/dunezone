import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { DiscordFailure, DiscordRest, discordConfiguration } from './lib/discordRest';

type Claim = { channelId: Id<'play_game_discord_channels'>; lease: string };

async function createRoom(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>,
  name: string
) {
  const [botId, categories] = await Promise.all([rest.botId(), rest.categories(row.guild_id, row.category_ids)]);
  for (const categoryId of categories) {
    if (!(await ctx.runMutation(internal.playDiscord.startCreation, claim))) {
      return;
    }
    let channelId: string;
    try {
      channelId = await rest.create(row.guild_id, categoryId, name, botId);
    } catch (error) {
      if (error instanceof DiscordFailure && error.status >= 400 && error.status < 500) {
        await ctx.runMutation(internal.playDiscord.rejectedCreation, claim);
        /* A category may have filled since listing it; Discord rejected the create, so trying the next category is safe. */
        if (error.status === 400 && error.code === 50_035) {
          continue;
        }
      }
      throw error;
    }
    if (!(await ctx.runMutation(internal.playDiscord.created, { ...claim, discordChannelId: channelId }))) {
      await rest.remove(channelId);
    }
    return;
  }
  throw new Error('No configured Discord category has room for another voice channel.');
}

async function syncGrant(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>,
  grantId: Id<'play_game_discord_grants'>
) {
  if (!row.channel_id) {
    return;
  }
  /* A seat can change during a request. A bounded retry compensates stale writes, leaving further work durable. */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const work = await ctx.runMutation(internal.playDiscord.grantWork, { ...claim, grantId });
    if (!work) {
      return;
    }
    const { grant, allow } = work;
    if (!allow) {
      await rest.revoke(row.channel_id, grant.discord_user_id);
      if (
        await ctx.runMutation(internal.playDiscord.grantFinished, {
          ...claim,
          grantId,
          revision: grant.revision,
          state: 'revoked',
        })
      ) {
        return;
      }
      continue;
    }
    if (!work.admit) {
      await rest.grant(row.channel_id, grant.discord_user_id);
      if (
        await ctx.runMutation(internal.playDiscord.grantFinished, {
          ...claim,
          grantId,
          revision: grant.revision,
          state: 'granted',
        })
      ) {
        return;
      }
      const latest = await ctx.runMutation(internal.playDiscord.grantWork, { ...claim, grantId });
      if (!latest?.allow) {
        await rest.revoke(row.channel_id, grant.discord_user_id);
      }
      continue;
    }
    const member = await rest.member(row.guild_id, grant.discord_user_id);
    let granted = false;
    try {
      /* Some guilds accept a non-member overwrite; otherwise the next Join request applies it after the invite is accepted. */
      await rest.grant(row.channel_id, grant.discord_user_id);
      granted = true;
    } catch (error) {
      if (member || !(error instanceof DiscordFailure && error.status === 404 && error.code === 10_007)) {
        throw error;
      }
    }
    const latest = await ctx.runMutation(internal.playDiscord.grantWork, { ...claim, grantId });
    if (!latest || !latest.allow || latest.grant.revision !== grant.revision) {
      if (granted && !latest?.allow) {
        await rest.revoke(row.channel_id, grant.discord_user_id);
      }
      continue;
    }
    const requesting = grant.request_state === 'pending';
    const url = requesting
      ? member
        ? `https://discord.com/channels/${row.guild_id}/${row.channel_id}`
        : await rest.invite(row.channel_id)
      : undefined;
    const committed = await ctx.runMutation(internal.playDiscord.grantFinished, {
      ...claim,
      grantId,
      revision: grant.revision,
      state: member ? 'granted' : 'pending',
      ...(url ? { url, kind: member ? ('channel' as const) : ('invite' as const) } : {}),
    });
    if (committed) {
      return;
    }
    const current = await ctx.runMutation(internal.playDiscord.grantWork, { ...claim, grantId });
    if (granted && !current?.allow) {
      await rest.revoke(row.channel_id, grant.discord_user_id);
    }
  }
}

/** One owner serializes external effects for a game; mutations keep later desired changes while that owner waits on Discord. */
export const reconcile = internalAction({
  args: { channelId: v.id('play_game_discord_channels') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = discordConfiguration();
    if (!config) {
      return null;
    }
    const row = await ctx.runMutation(internal.playDiscord.claim, args);
    if (!row?.lease) {
      return null;
    }
    const claim = { ...args, lease: row.lease };
    const rest = new DiscordRest(config.token, `Dune Play game ${row.game_id}`, {
      until: () => ctx.runQuery(internal.playDiscord.cooldownUntil, {}),
      hold: (until) => ctx.runMutation(internal.playDiscord.holdRequests, { until }),
    });
    let failure: { error: string; retryAfterMs?: number } | undefined;
    try {
      let work = await ctx.runMutation(internal.playDiscord.work, claim);
      if (work && !work.remove && work.channel.state === 'pending') {
        await createRoom(ctx, rest, claim, work.channel, work.name);
        work = await ctx.runMutation(internal.playDiscord.work, claim);
      }
      if (work?.channel.state === 'creating') {
        throw new Error('Channel creation has no confirmed result. Check Discord before retrying it.');
      }
      if (work?.remove && (await ctx.runMutation(internal.playDiscord.beginDeletion, claim))) {
        if (work.channel.channel_id) {
          await rest.remove(work.channel.channel_id);
        }
        await ctx.runMutation(internal.playDiscord.removed, claim);
      } else if (work?.channel.channel_id) {
        const started = Date.now();
        for (const grant of work.grants) {
          if (Date.now() - started > 4 * 60_000) {
            break;
          }
          try {
            await syncGrant(ctx, rest, claim, work.channel, grant._id);
          } catch (error) {
            await ctx.runMutation(internal.playDiscord.grantFailed, {
              ...claim,
              grantId: grant._id,
              revision: grant.revision,
              retryAfterMs: error instanceof DiscordFailure ? error.retryAfterMs : 0,
            });
            if (error instanceof DiscordFailure && error.status === 429) {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      failure = {
        error: error instanceof DiscordFailure ? error.message : 'Discord voice work could not finish.',
        ...(error instanceof DiscordFailure ? { retryAfterMs: error.retryAfterMs } : {}),
      };
    } finally {
      await ctx.runMutation(internal.playDiscord.release, { ...claim, ...failure });
    }
    return null;
  },
});
