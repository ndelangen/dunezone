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
 * Rows still on the legacy channel: a hot-linked string with no stored cover.
 * The scan reads the oldest 500 rulesets and says so: `truncated` reports whether the table extends past the window, because a rerun re-reads the same window and would otherwise look exhaustive.
 */
export const listLegacyCovers = internalQuery({
  args: {},
  returns: v.object({
    rows: v.array(v.object({ id: v.id('rulesets'), slug: v.string(), image_cover: v.string() })),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const window = await ctx.db.query('rulesets').take(501);
    const truncated = window.length === 501;
    const rows = window
      .slice(0, 500)
      .filter(
        (row): row is typeof row & { image_cover: string } =>
          typeof row.image_cover === 'string' && row.cover == null && !row.is_deleted
      )
      .map((row) => ({ id: row._id, slug: row.slug, image_cover: row.image_cover }));
    return { rows, truncated };
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
 * Rehosts every legacy hot-linked cover, run once by an operator after the rehost release ships.
 * Rides the token path like the author save, differing only in the expected echo it pins: the mint records the legacy string the scan saw, so a row an author rehosted while the Worker was fetching bounces in the consume mutation and counts as skipped.
 * A row whose source cannot be fetched is reported and left untouched, so a flaky host degrades to a rerun rather than data loss.
 * `truncated` passes the scan window's own report through;
 * a true value means rows past the first 500 rulesets were not seen.
 */
export const backfillLegacyCovers = internalAction({
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
      rows: { id: Doc<'rulesets'>['_id']; slug: string; image_cover: string }[];
      truncated: boolean;
    } = await ctx.runQuery(internal.rulesetCovers.listLegacyCovers, {});
    let rehosted = 0;
    let skipped = 0;
    const failed: { slug: string; message: string }[] = [];
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
          error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : 'Rehost failed';
        failed.push({ slug: row.slug, message });
      }
    }
    return { rehosted, skipped, failed, truncated: legacy.truncated };
  },
});
