import { ConvexError, v } from 'convex/values';

import { parseRawAsset, parseRawFaction, rawRulebookSchema, readRawAuthoringJson } from '../src/shared/authoring/raw';
import { viewerQuery } from './functions';
import {
  TOKEN_ASSET_TYPES,
  assertReferenceableDeckCardback,
  assertReferenceableTokenBack,
  ownPublishedFace,
} from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import { resolveCustomCardTokens, customCardTokenIds, customCardPublicationError } from './lib/customCardTokens';
import { requireAuthUserId } from './lib/policy';
import { assertRawRulebookDestination, assertRawRulebookReferences } from './lib/rawRulebookValidation';
import { resolveSpiceCardBoard, spiceCardTokenIds, spiceCardPublicationError } from './lib/spiceCardBoard';
import type { QueryCtx } from './types';

async function linkedBackRow(ctx: QueryCtx, args: { type: string; targetId?: string; referenceId: string }) {
  const ownId = args.targetId ? ctx.db.normalizeId('assets', args.targetId) : null;
  const referenceId = ctx.db.normalizeId('assets', args.referenceId);
  if ((args.targetId && !ownId) || !referenceId) {
    throw new ConvexError('Choose an available back reference.');
  }
  const target = { _id: ownId, type: args.type };
  if (TOKEN_ASSET_TYPES.has(args.type)) {
    return await assertReferenceableTokenBack(ctx, target, referenceId);
  }
  if (args.type === 'deck') {
    return await assertReferenceableDeckCardback(ctx, target, referenceId);
  }
  throw new ConvexError('This Asset type has no linked back.');
}

/** Display data for a validated linked back, read lazily before explicit Load. */
export const linkedBack = viewerQuery({
  args: { type: v.string(), targetId: v.optional(v.string()), referenceId: v.string() },
  returns: v.object({
    id: v.id('assets'),
    name: v.string(),
    data: v.any(),
    previewHref: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const row = await linkedBackRow(ctx, args);
    return { id: row._id, name: assetDisplayName(row), data: row.data, previewHref: ownPublishedFace(row) };
  },
});

async function faction(ctx: QueryCtx, id: string, path: string) {
  const key = ctx.db.normalizeId('factions', id);
  const row = key ? await ctx.db.get('factions', key) : null;
  if (!row || row.is_deleted) {
    throw new ConvexError(`${path}: Choose an available faction.`);
  }
  return row;
}

/** Checks pasted values and their live references without changing any application record. */
export const raw = viewerQuery({
  args: {
    kind: v.union(v.literal('asset'), v.literal('faction'), v.literal('rulebook')),
    type: v.optional(v.string()),
    targetId: v.optional(v.string()),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const input = readRawAuthoringJson(args.text);
    if (args.kind === 'faction') {
      const data = parseRawFaction(input);
      for (const [index, extra] of (data.extras ?? []).entries()) {
        const row = await ctx.db
          .query('assets')
          .withIndex('by_type_and_slug', (q) => q.eq('type', extra.type).eq('slug', extra.slug))
          .unique();
        if (!row || row.is_deleted) {
          throw new ConvexError(`$.extras.${index}: The ${extra.type}/${extra.slug} asset is unavailable.`);
        }
      }
      return null;
    }
    if (args.kind === 'rulebook') {
      const data = rawRulebookSchema.parse(input);
      await assertRawRulebookDestination(ctx, args.targetId, data);
      await assertRawRulebookReferences(ctx, data.contents);
      return null;
    }
    if (!args.type) {
      throw new ConvexError('Choose an Asset type.');
    }
    const data = parseRawAsset(args.type, input).data as Record<string, unknown>;
    const back = data.back as { mode?: string; asset_id?: string } | undefined;
    if (TOKEN_ASSET_TYPES.has(args.type) && back?.mode === 'reference' && back.asset_id) {
      await linkedBackRow(ctx, { ...args, type: args.type, referenceId: back.asset_id });
    }
    const cardback = data.cardback as { mode?: string; asset_id?: string } | undefined;
    if (args.type === 'deck' && cardback?.mode === 'reference' && cardback.asset_id) {
      await linkedBackRow(ctx, { ...args, type: args.type, referenceId: cardback.asset_id });
    }
    const board = data.board as { asset_id: string } | undefined;
    if (args.type === 'card-spice' && board) {
      const resolved = await resolveSpiceCardBoard(ctx, board.asset_id, spiceCardTokenIds(data));
      const error = spiceCardPublicationError(data, resolved);
      if (error) {
        throw new ConvexError(error);
      }
      if (!resolved.board) {
        throw new ConvexError('$.board.asset_id: Choose an available, renderable board.');
      }
      if (Object.values(resolved.tokens).some((token) => token === null)) {
        throw new ConvexError('$.board.tokens: A token is unavailable.');
      }
    }
    if (args.type === 'card-custom' || args.type === 'card-storm') {
      const resolved = await resolveCustomCardTokens(ctx, customCardTokenIds(data));
      const error = customCardPublicationError(data, resolved);
      if (error) {
        throw new ConvexError(error);
      }
      if (Object.values(resolved.tokens).some((token) => token === null)) {
        throw new ConvexError('$.layers: A linked token is unavailable.');
      }
    }
    const linkedFaction = data.factionLink as { id: string; slug: string } | undefined;
    if (linkedFaction) {
      const row = await faction(ctx, linkedFaction.id, '$.factionLink');
      if (row.slug !== linkedFaction.slug) {
        throw new ConvexError('$.factionLink.slug: The faction address does not match its ID.');
      }
    }
    return null;
  },
});
