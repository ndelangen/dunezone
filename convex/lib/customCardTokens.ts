import { ConvexError } from 'convex/values';
import type { z } from 'zod';

import {
  CustomCardAsset,
  CUSTOM_CARD_MAX_LAYERS,
  RectangleTokenAsset,
  TokenAsset,
} from '../../src/shared/assets/schema';
import type { CustomCardTokens, CustomCardTokenResolution } from '../../src/shared/assets/schema';
import { compareCodeUnits } from '../../src/shared/compareText';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';

export const CUSTOM_CARD_TOKEN_RELATION = 'custom-card-token';
const MAX_RESOLVED_TOKEN_BYTES = 524_288;
const MAX_TOKEN_READ_BYTES = 4_194_304;
const TOKEN_SIZE_ERROR =
  'Linked token artwork is too large for one card. Remove a Token layer or simplify its original token.';

/** Leaves room for the publication envelope and Convex's encoded document overhead. */
export function customCardPublicationError(data: unknown, resolved: z.infer<typeof CustomCardTokenResolution>) {
  return (
    resolved.error ??
    (new TextEncoder().encode(JSON.stringify({ card: data, tokens: resolved.tokens })).length > 786_432
      ? 'The card and linked token artwork are too large to publish. Shorten text or remove layers.'
      : null)
  );
}

/** Repeated layers share one target read and one reverse reference. */
export function customCardTokenIds(data: unknown): string[] {
  const parsed = CustomCardAsset.safeParse(data);
  return parsed.success
    ? [...new Set(parsed.data.layers.flatMap((layer) => (layer.kind === 'token' ? [layer.asset_id] : [])))].sort(
        compareCodeUnits
      )
    : [];
}

function tokenFront(row: Doc<'assets'> | null): z.infer<typeof CustomCardTokens>[string] {
  if (!row || row.is_deleted) {
    return null;
  }
  switch (row.type) {
    case 'token-enhance': {
      const parsed = RectangleTokenAsset.safeParse(row.data);
      return parsed.success ? { type: row.type, name: parsed.data.name, face: parsed.data.front } : null;
    }
    case 'token-disc':
    case 'token-tech':
    case 'token-plate': {
      const parsed = TokenAsset.safeParse(row.data);
      return parsed.success ? { type: row.type, name: parsed.data.name, face: parsed.data.front } : null;
    }
    default:
      return null;
  }
}

/** Missing targets stay explicit so editors can offer a replacement without losing the layer. */
export async function resolveCustomCardTokens(
  ctx: Pick<QueryCtx, 'db'>,
  ids: readonly string[]
): Promise<z.infer<typeof CustomCardTokenResolution>> {
  if (ids.length > CUSTOM_CARD_MAX_LAYERS) {
    throw new ConvexError('Too many linked tokens');
  }
  const tokens: z.infer<typeof CustomCardTokens> = {};
  let bytes = 2;
  let readBytes = 0;
  for (const raw of new Set(ids)) {
    const id = ctx.db.normalizeId('assets', raw);
    const row = id ? await ctx.db.get('assets', id) : null;
    tokens[raw] = tokenFront(row);
    readBytes += new TextEncoder().encode(JSON.stringify(row?.data ?? null)).length;
    if (readBytes > MAX_TOKEN_READ_BYTES) {
      return { tokens: {}, error: TOKEN_SIZE_ERROR };
    }
    bytes += new TextEncoder().encode(JSON.stringify({ [raw]: tokens[raw] })).length;
    if (bytes > MAX_RESOLVED_TOKEN_BYTES) {
      return {
        tokens: {},
        error: TOKEN_SIZE_ERROR,
      };
    }
  }
  return { tokens, error: null };
}

/** New references must resolve; a previously linked token may have been deleted since opening. */
export async function validateCustomCardTokens(ctx: MutationCtx, data: unknown, previous?: unknown) {
  const ids = customCardTokenIds(data);
  const resolved = await resolveCustomCardTokens(ctx, ids);
  const { tokens } = resolved;
  const error = customCardPublicationError(data, resolved);
  if (error) {
    throw new ConvexError(error);
  }
  const carried = new Set(customCardTokenIds(previous));
  for (const id of ids) {
    if (!tokens[id] && !carried.has(id)) {
      throw new ConvexError('Choose an available token asset for every new Token layer');
    }
  }
}

/** The card draft owns membership; reverse rows only index its current dependencies. */
export async function syncCustomCardTokenRelations(ctx: MutationCtx, cardId: Id<'assets'>, data: unknown) {
  const ids = new Set(customCardTokenIds(data));
  const current = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', cardId).eq('kind', CUSTOM_CARD_TOKEN_RELATION))
    .take(CUSTOM_CARD_MAX_LAYERS + 1);
  for (const relation of current) {
    if (!ids.delete(relation.to_asset_id)) {
      await ctx.db.delete(relation._id);
    }
  }
  const additions = [...ids].flatMap((raw) => {
    const id = ctx.db.normalizeId('assets', raw);
    return id ? [id] : [];
  });
  for (const id of additions) {
    await ctx.db.insert('asset_relations', {
      from_asset_id: cardId,
      to_asset_id: id,
      kind: CUSTOM_CARD_TOKEN_RELATION,
      count: 1,
    });
  }
}
