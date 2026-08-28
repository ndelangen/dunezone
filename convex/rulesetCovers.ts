import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { userImageSourceUrlSchema } from '../src/shared/user-images/contract';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { action, internalAction, internalQuery } from './_generated/server';
import { requireRulesetUpdate } from './lib/collaborativeAccess';
import { ingestBaseUrl, ingestWithToken } from './lib/userImageIngest';

/**
 * The cover rehost pipeline.
 *
 * `rehost` is the only way a cover enters the system: it mints a single-use ledger token, then sends the author's URL to the Worker's ingest endpoint, which fetches it once, re-encodes it as a progressive JPEG and stores it in the user-image bucket.
 * The stored result comes back through the Worker's consuming mutation on `ingestTokens`, not through the HTTP response, which is only a completion signal for the waiting save.
 * The document then carries our delivery URL, so readers never contact the host the author chose.
 * The legacy `image_cover` string is dual-written with the delivery URL until the retirement release, so a pre-rehost bundle keeps rendering covers during the deploy window.
 * The operator backfill rides the same token path as the author save;
 * it differs only in pinning an expected echo, so a row an author changed mid-fetch is left alone.
 */

/** Rows read per scan page. Small enough that a page of legacy rows is a modest batch of ingests, large enough that a mostly-converted table is walked in few queries. */
const BACKFILL_SCAN_PAGE = 200;

/**
 * Rows attempted before one invocation hands back its cursor.
 * Checked after a whole page rather than mid-page, so this is the point at which the run stops rather than a hard cap on attempts.
 */
const BACKFILL_WORK_BUDGET = 100;

/** The pre-fetch gate, so an unauthorized caller is refused before the Worker spends a fetch on their URL. */
export const assertEditable = internalQuery({
  args: { id: v.id('rulesets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRulesetUpdate(ctx, args.id);
    return null;
  },
});

/**
 * Rehosts one cover for the signed-in author.
 * Validation, access, config, mint and fetch run in that order, so the cheap refusals come first, no token is minted for a save that cannot proceed, and the URL is fetched at most once.
 * Access is checked once, at mint time;
 * from there the token's capability is the authorization, and the Worker's consuming mutation performs the write.
 * The await is deliberate: the save-and-wait UX is unchanged, and the response is the author's success or failure signal even though it carries no data.
 */
export const rehost = action({
  args: { id: v.id('rulesets'), source_url: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parsedSource = userImageSourceUrlSchema.safeParse(args.source_url);
    if (!parsedSource.success) {
      throw new ConvexError(parsedSource.error.issues[0]?.message ?? 'Invalid cover image URL');
    }
    await ctx.runQuery(internal.rulesetCovers.assertEditable, { id: args.id });
    const baseUrl = ingestBaseUrl();
    const minted: { token: string } = await ctx.runMutation(internal.ingestTokens.mint, {
      capability: { kind: 'ruleset_cover', ruleset_id: args.id },
      source_url: parsedSource.data,
    });
    await ingestWithToken(baseUrl, parsedSource.data, minted.token);
    return null;
  },
});

/**
 * One page of rows still on the legacy channel: a hot-linked string with no stored cover.
 * Paginated rather than a fixed head window, because converted rows keep their position: a scan that always read the first 500 rulesets would re-read the same rows on every rerun and could never reach the ones behind them.
 * The returned cursor is null once the table is exhausted, which is the only honest way to say the scan is complete.
 */
export const listLegacyCovers = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    rows: v.array(v.object({ id: v.id('rulesets'), slug: v.string(), image_cover: v.string() })),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('rulesets').paginate(args.paginationOpts);
    const rows = page.page
      .filter(
        (row): row is typeof row & { image_cover: string } =>
          typeof row.image_cover === 'string' && row.cover == null && !row.is_deleted
      )
      .map((row) => ({ id: row._id, slug: row.slug, image_cover: row.image_cover }));
    return { rows, cursor: page.isDone ? null : page.continueCursor };
  },
});

/**
 * The echo a failed backfill row is rechecked against, to tell a race from a genuine failure.
 * The write-time guard lives in the consume mutation;
 * this read only classifies its refusal after the fact.
 */
export const currentCoverEcho = internalQuery({
  args: { id: v.id('rulesets') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.id))?.image_cover ?? null,
});

/**
 * Rehosts legacy hot-linked covers, run by an operator after the rehost release ships.
 * Rides the token path like the author save, differing only in the expected echo it pins: the mint records the legacy string the scan saw, so a row an author rehosted while the Worker was fetching bounces in the consume mutation and counts as skipped.
 * A row whose source cannot be fetched is reported and left untouched, so a flaky host degrades to a rerun rather than data loss.
 *
 * The scan walks the table by cursor, so a rerun makes progress instead of re-reading the same head.
 * One invocation stops after the page that spends the work budget and hands back `next_cursor`;
 * the operator reruns with it until it comes back null, which is what makes an arbitrarily large table reachable without one call carrying every ingest.
 * A page is never abandoned half-done, so the cursor always points past rows that were fully processed.
 */
export const backfillLegacyCovers = internalAction({
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
        rows: { id: Doc<'rulesets'>['_id']; slug: string; image_cover: string }[];
        cursor: string | null;
      } = await ctx.runQuery(internal.rulesetCovers.listLegacyCovers, {
        paginationOpts: { cursor, numItems: BACKFILL_SCAN_PAGE },
      });
      for (const row of legacy.rows) {
        const parsedSource = userImageSourceUrlSchema.safeParse(row.image_cover);
        if (!parsedSource.success) {
          failed.push({ slug: row.slug, message: parsedSource.error.issues[0]?.message ?? 'Invalid legacy URL' });
          continue;
        }
        const minted: { token: string } = await ctx.runMutation(internal.ingestTokens.mint, {
          capability: { kind: 'ruleset_cover', ruleset_id: row.id, expected_echo: row.image_cover },
          source_url: parsedSource.data,
        });
        try {
          await ingestWithToken(baseUrl, parsedSource.data, minted.token);
          rehosted += 1;
        } catch (error) {
          /* An echo that moved since the scan means the consume guard bounced a stale result, not that the source failed; the newer write already owns the row. */
          const echo: string | null = await ctx.runQuery(internal.rulesetCovers.currentCoverEcho, { id: row.id });
          if (echo !== row.image_cover) {
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
