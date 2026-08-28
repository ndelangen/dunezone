import { paginationOptsValidator } from 'convex/server';
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

/** Rows read per scan page, and rows attempted before one invocation hands back its cursor. Mirrors the cover arm, which walks the same shape against a different table. */
const BACKFILL_SCAN_PAGE = 200;
const BACKFILL_WORK_BUDGET = 100;

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
 * One page of rows still on the legacy channel: an avatar URL with no stored avatar, on an account that is not deleting.
 * Paginated for the same reason as the cover scan: converted rows keep their position, so a fixed head window would re-read the same rows on every rerun and never reach the ones behind them.
 * The returned cursor is null once the table is exhausted.
 */
export const listLegacyAvatars = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    rows: v.array(v.object({ id: v.id('profiles'), slug: v.string(), avatar_url: v.string() })),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('profiles').paginate(args.paginationOpts);
    const rows = page.page
      .filter(
        (row): row is typeof row & { avatar_url: string } =>
          typeof row.avatar_url === 'string' && row.avatar_url.length > 0 && row.avatar == null && isActiveProfile(row)
      )
      .map((row) => ({ id: row._id, slug: row.slug, avatar_url: row.avatar_url }));
    return { rows, cursor: page.isDone ? null : page.continueCursor };
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
 * Rehosts legacy external avatars, run by an operator after the rehost release ships.
 * Rides the token path like the save flow, so the consume mutation's expected-echo recheck is the race guard: a row the user changed while the Worker was fetching bounces there and counts as skipped.
 * A row whose source cannot be fetched is reported and left untouched, so a flaky host degrades to a rerun rather than data loss.
 *
 * The scan walks the table by cursor, so a rerun makes progress instead of re-reading the same head.
 * One invocation stops after the page that spends the work budget and hands back `next_cursor`;
 * the operator reruns with it until it comes back null.
 * A page is never abandoned half-done, so the cursor always points past rows that were fully processed.
 */
export const backfillLegacyAvatars = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({
    rehosted: v.number(),
    skipped: v.number(),
    failed: v.array(v.object({ slug: v.string(), message: v.string() })),
    next_cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const baseUrl = ingestBaseUrl();
    let cursor: string | null = args.cursor ?? null;
    let rehosted = 0;
    let skipped = 0;
    const failed: { slug: string; message: string }[] = [];
    for (;;) {
      const legacy: {
        rows: { id: Doc<'profiles'>['_id']; slug: string; avatar_url: string }[];
        cursor: string | null;
      } = await ctx.runQuery(internal.profileAvatars.listLegacyAvatars, {
        paginationOpts: { cursor, numItems: BACKFILL_SCAN_PAGE },
      });
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
            error instanceof ConvexError
              ? String(error.data)
              : error instanceof Error
                ? error.message
                : 'Rehost failed';
          failed.push({ slug: row.slug, message });
        }
      }
      cursor = legacy.cursor;
      if (cursor === null || rehosted + skipped + failed.length >= BACKFILL_WORK_BUDGET) {
        break;
      }
    }
    return { rehosted, skipped, failed, next_cursor: cursor };
  },
});
