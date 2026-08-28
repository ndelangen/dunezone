import { ConvexError, v } from 'convex/values';

import { userAvatarSourceUrlSchema } from '../src/shared/user-images/contract';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, internalQuery } from './_generated/server';
import { isActiveProfile } from './lib/accountLifecycle';
import { ingestBaseUrl, ingestWithToken } from './lib/userImageIngest';

/**
 * The avatar rehost pipeline, the ledger path's second capability.
 *
 * Unlike covers, avatars rehost asynchronously: the mutation that accepts an external URL writes it as `avatar_url`, and `rehost` runs after commit with no author waiting on it.
 * The stored result lands through the ledger's consuming mutation whenever the Worker finishes, and the page keeps rendering the external URL until that flip.
 * Everything here is internal: authorization happened in the mutation that scheduled the work, and from mint onward the token's capability is the authorization.
 */

/**
 * Rehosts one avatar source through the token path.
 * Scheduled by the profile mutations, and called directly by the backfill loop below.
 * A source that fails the floor is logged and dropped rather than thrown: seeded provider URLs are historical data, and the row keeps rendering its external URL exactly as it did before this pipeline existed.
 */
export const rehost = internalAction({
  args: { profile_id: v.id('profiles'), source_url: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parsedSource = userAvatarSourceUrlSchema.safeParse(args.source_url);
    if (!parsedSource.success) {
      console.warn(
        JSON.stringify({
          event: 'profile_avatar_rehost_refused',
          profile_id: args.profile_id,
          reason: parsedSource.error.issues[0]?.message ?? 'Invalid avatar image URL',
        })
      );
      return null;
    }
    const baseUrl = ingestBaseUrl();
    const minted: { token: string } = await ctx.runMutation(internal.ingestTokens.mint, {
      capability: { kind: 'profile_avatar', profile_id: args.profile_id },
      source_url: parsedSource.data,
    });
    await ingestWithToken(baseUrl, parsedSource.data, minted.token);
    return null;
  },
});

/**
 * Rows still on the legacy channel: an avatar URL with no stored avatar, on an account that is not deleting.
 * The scan reads the oldest 500 profiles and says so: `truncated` reports whether the table extends past the window, because a rerun re-reads the same window and would otherwise look exhaustive.
 */
export const listLegacyAvatars = internalQuery({
  args: {},
  returns: v.object({
    rows: v.array(v.object({ id: v.id('profiles'), slug: v.string(), avatar_url: v.string() })),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const window = await ctx.db.query('profiles').take(501);
    const truncated = window.length === 501;
    const rows = window
      .slice(0, 500)
      .filter(
        (row): row is typeof row & { avatar_url: string } =>
          typeof row.avatar_url === 'string' && row.avatar_url.length > 0 && row.avatar == null && isActiveProfile(row)
      )
      .map((row) => ({ id: row._id, slug: row.slug, avatar_url: row.avatar_url }));
    return { rows, truncated };
  },
});

/**
 * The echo a failed backfill row is rechecked against, to tell a race from a genuine failure.
 * The write-time guard lives in the consume mutation;
 * this read only classifies its refusal after the fact.
 */
export const currentAvatarEcho = internalQuery({
  args: { id: v.id('profiles') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.id))?.avatar_url ?? null,
});

/**
 * Rehosts every legacy external avatar, run once by an operator after the rehost release ships.
 * Rides the token path like the save flow, so the consume mutation's expected-echo recheck is the race guard: a row the user changed while the Worker was fetching bounces there and counts as skipped.
 * A row whose source cannot be fetched is reported and left untouched, so a flaky host degrades to a rerun rather than data loss.
 * `truncated` passes the scan window's own report through;
 * a true value means rows past the first 500 profiles were not seen.
 */
export const backfillLegacyAvatars = internalAction({
  args: {},
  returns: v.object({
    rehosted: v.number(),
    skipped: v.number(),
    failed: v.array(v.object({ slug: v.string(), message: v.string() })),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const baseUrl = ingestBaseUrl();
    const legacy: {
      rows: { id: Doc<'profiles'>['_id']; slug: string; avatar_url: string }[];
      truncated: boolean;
    } = await ctx.runQuery(internal.profileAvatars.listLegacyAvatars, {});
    let rehosted = 0;
    let skipped = 0;
    const failed: { slug: string; message: string }[] = [];
    for (const row of legacy.rows) {
      const parsedSource = userAvatarSourceUrlSchema.safeParse(row.avatar_url);
      if (!parsedSource.success) {
        failed.push({ slug: row.slug, message: parsedSource.error.issues[0]?.message ?? 'Invalid legacy URL' });
        continue;
      }
      const minted: { token: string } = await ctx.runMutation(internal.ingestTokens.mint, {
        capability: { kind: 'profile_avatar', profile_id: row.id },
        source_url: parsedSource.data,
      });
      try {
        await ingestWithToken(baseUrl, parsedSource.data, minted.token);
        rehosted += 1;
      } catch (error) {
        /* An echo that moved since the scan means the consume guard bounced a stale result, not that the source failed; the newer write already owns the row. */
        const echo: string | null = await ctx.runQuery(internal.profileAvatars.currentAvatarEcho, { id: row.id });
        if (echo !== row.avatar_url) {
          skipped += 1;
          continue;
        }
        const message =
          error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : 'Rehost failed';
        failed.push({ slug: row.slug, message });
      }
    }
    return { rehosted, skipped, failed, truncated: legacy.truncated };
  },
});
