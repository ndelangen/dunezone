import { ConvexError, v } from 'convex/values';

import { parseRawAsset, parseRawFaction, rawRulebookSchema, readRawAuthoringJson } from '../src/shared/authoring/raw';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import { resolveRulebookBoardDefinition } from '../src/shared/rulebooks/boardDefinitions';
import { collectRulebookReferenceIds } from '../src/shared/rulebooks/references';
import { resolveRulebookArtworkSource } from '../src/shared/rulebooks/sources';
import type { Id } from './_generated/dataModel';
import { viewerQuery } from './functions';
import { TOKEN_ASSET_TYPES, assertReferenceableDeckCardback, assertReferenceableTokenBack } from './lib/assetBacks';
import { resolveCustomCardTokens, customCardTokenIds, customCardPublicationError } from './lib/customCardTokens';
import { requireAuthUserId } from './lib/policy';
import { resolveSpiceCardBoard, spiceCardTokenIds, spiceCardPublicationError } from './lib/spiceCardBoard';
import type { QueryCtx } from './types';

async function asset(ctx: QueryCtx, id: string, path: string, types?: readonly string[]) {
  const key = ctx.db.normalizeId('assets', id);
  const row = key ? await ctx.db.get('assets', key) : null;
  if (!row || row.is_deleted || (types && !types.includes(row.type))) {
    throw new ConvexError(`${path}: Choose an available ${types?.join(' or ') ?? 'asset'}.`);
  }
  return row;
}
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
      const refs = collectRulebookReferenceIds(data.contents);
      await Promise.all([
        ...refs.assetIds.map((id) => asset(ctx, id, '$.contents')),
        ...refs.factionIds.map((id) => faction(ctx, id, '$.contents')),
      ]);
      /* Source kinds carry stricter identities than a generic asset ID. */
      const pending: unknown[] = [data.contents];
      while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object') {
          continue;
        }
        const record = value as Record<string, unknown>;
        if (typeof record.boardId === 'string' && !resolveRulebookBoardDefinition(record.boardId)) {
          await asset(ctx, record.boardId, '$.contents.source', ['board']);
        }
        if (
          record.kind === 'stock' &&
          typeof record.artworkId === 'string' &&
          resolveRulebookArtworkSource({ kind: 'stock', artworkId: record.artworkId })?.status !== 'ready'
        ) {
          throw new ConvexError('$.contents.source.artworkId: Maintained artwork is unavailable.');
        }
        if (
          (record.kind === 'faction-member' || record.kind === 'faction-troop') &&
          typeof record.factionId === 'string'
        ) {
          const row = await faction(ctx, record.factionId, '$.contents.source');
          const parsed = CanonicalFactionStoredSchema.parse(row.data);
          const exists =
            record.kind === 'faction-member'
              ? [parsed.factionLeader, ...parsed.leaders].some((member) => member.memberId === record.memberId)
              : parsed.troops.some((troop) => troop.troopId === record.troopId);
          if (!exists) {
            throw new ConvexError('$.contents.source: This faction component is unavailable.');
          }
        }
        pending.push(...Object.values(record));
      }
      return null;
    }
    if (!args.type) {
      throw new ConvexError('Choose an Asset type.');
    }
    const data = parseRawAsset(args.type, input).data as Record<string, unknown>;
    const ownId = args.targetId ? ctx.db.normalizeId('assets', args.targetId) : null;
    const back = data.back as { mode?: string; asset_id?: string } | undefined;
    if (TOKEN_ASSET_TYPES.has(args.type) && back?.mode === 'reference' && back.asset_id) {
      await assertReferenceableTokenBack(ctx, { _id: ownId, type: args.type }, back.asset_id as Id<'assets'>);
    }
    const cardback = data.cardback as { mode?: string; asset_id?: string } | undefined;
    if (args.type === 'deck' && cardback?.mode === 'reference' && cardback.asset_id) {
      await assertReferenceableDeckCardback(ctx, { _id: ownId, type: args.type }, cardback.asset_id as Id<'assets'>);
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
