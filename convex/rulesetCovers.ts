import { ConvexError, v } from 'convex/values';

import {
  USER_IMAGE_INGEST_PATH,
  userImageIngestErrorSchema,
  userImageIngestResponseSchema,
  userImageSourceUrlSchema,
} from '../src/shared/user-images/contract';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { action, internalAction, internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { requireRulesetUpdate } from './lib/collaborativeAccess';
import { rulesetCoverValidator } from './lib/rulesetCover';
import type { RulesetCover } from './lib/rulesetCover';
import { nowIso } from './lib/utils';
import type { MutationCtx } from './types';

/**
 * The cover rehost pipeline.
 *
 * `rehost` is the only way a cover enters the system: it sends the author's URL to the Worker's ingest endpoint, which fetches it once, re-encodes it as a progressive JPEG and stores it in the user-image bucket.
 * The document then carries our delivery URL, so readers never contact the host the author chose.
 * The legacy `image_cover` string is dual-written with the delivery URL until the retirement release, so a pre-rehost bundle keeps rendering covers during the deploy window.
 */

type IngestConfig = { baseUrl: string; secret: string };

function ingestConfig(): IngestConfig {
  const baseUrl = process.env.USER_IMAGE_INGEST_BASE_URL;
  const secret = process.env.USER_IMAGE_INGEST_SECRET;
  if (!baseUrl || !secret) {
    throw new Error('Cover storage is not configured for this deployment');
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), secret };
}

/**
 * Posts one source URL to the Worker and returns the stored cover, or throws the author-facing refusal the Worker answered with.
 * Refusals travel as `ConvexError` because a plain error's message is redacted to "Server Error" outside dev, and these messages exist to be read by the author.
 */
async function ingestSourceUrl(config: IngestConfig, sourceUrl: string): Promise<RulesetCover> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${USER_IMAGE_INGEST_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source_url: sourceUrl }),
    });
  } catch {
    throw new ConvexError('Cover storage is unreachable');
  }
  if (!response.ok) {
    const refusal = userImageIngestErrorSchema.safeParse(await response.json().catch(() => null));
    if (response.status >= 400 && response.status < 500 && refusal.success) {
      throw new ConvexError(refusal.data.error);
    }
    throw new ConvexError('The cover could not be stored');
  }
  const payload = userImageIngestResponseSchema.safeParse(await response.json().catch(() => null));
  if (!payload.success) {
    throw new ConvexError('Cover storage answered with an unexpected shape');
  }
  return {
    url: payload.data.url,
    source_url: sourceUrl,
    width: payload.data.width,
    height: payload.data.height,
  };
}

async function patchStoredCover(ctx: MutationCtx, id: Doc<'rulesets'>['_id'], cover: RulesetCover): Promise<void> {
  await ctx.db.patch(id, {
    cover,
    image_cover: cover.url,
    updated_at: nowIso(),
  });
}

/** The pre-fetch gate, so an unauthorized caller is refused before the Worker spends a fetch on their URL. */
export const assertEditable = internalQuery({
  args: { id: v.id('rulesets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRulesetUpdate(ctx, args.id);
    return null;
  },
});

/** Commits a stored cover on the author path, re-checking access at write time. */
export const commit = internalMutation({
  args: { id: v.id('rulesets'), cover: rulesetCoverValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRulesetUpdate(ctx, args.id);
    await patchStoredCover(ctx, args.id, args.cover);
    return null;
  },
});

/** Commits a stored cover on the operator path, where no viewer identity exists; only the backfill action calls it. */
export const commitBackfill = internalMutation({
  args: { id: v.id('rulesets'), cover: rulesetCoverValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchStoredCover(ctx, args.id, args.cover);
    return null;
  },
});

/**
 * Rehosts one cover for the signed-in author.
 * Validation, access, fetch and commit run in that order, so the cheap refusals come first and the URL is fetched at most once.
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
    const cover: RulesetCover = await ingestSourceUrl(ingestConfig(), parsedSource.data);
    await ctx.runMutation(internal.rulesetCovers.commit, { id: args.id, cover });
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
        (row): row is typeof row & { image_cover: string } => typeof row.image_cover === 'string' && row.cover == null
      )
      .map((row) => ({ id: row._id, slug: row.slug, image_cover: row.image_cover }));
    return { rows, truncated };
  },
});

/**
 * Rehosts every legacy hot-linked cover, run once by an operator after the rehost release ships.
 * A row whose source cannot be fetched is reported and left untouched, so a flaky host degrades to a rerun rather than data loss.
 * `truncated` passes the scan window's own report through;
 * a true value means rows past the first 500 rulesets were not seen.
 */
export const backfillLegacyCovers = internalAction({
  args: {},
  returns: v.object({
    rehosted: v.number(),
    failed: v.array(v.object({ slug: v.string(), message: v.string() })),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const config = ingestConfig();
    const legacy: {
      rows: { id: Doc<'rulesets'>['_id']; slug: string; image_cover: string }[];
      truncated: boolean;
    } = await ctx.runQuery(internal.rulesetCovers.listLegacyCovers, {});
    const rows = legacy.rows;
    let rehosted = 0;
    const failed: { slug: string; message: string }[] = [];
    for (const row of rows) {
      const parsedSource = userImageSourceUrlSchema.safeParse(row.image_cover);
      if (!parsedSource.success) {
        failed.push({ slug: row.slug, message: parsedSource.error.issues[0]?.message ?? 'Invalid legacy URL' });
        continue;
      }
      try {
        const cover = await ingestSourceUrl(config, parsedSource.data);
        await ctx.runMutation(internal.rulesetCovers.commitBackfill, { id: row.id, cover });
        rehosted += 1;
      } catch (error) {
        const message =
          error instanceof ConvexError
            ? String(error.data)
            : error instanceof Error
              ? error.message
              : 'Rehost failed';
        failed.push({ slug: row.slug, message });
      }
    }
    return { rehosted, failed, truncated: legacy.truncated };
  },
});
