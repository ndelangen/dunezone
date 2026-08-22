import { ConvexError } from 'convex/values';

import { NO_DECK_BACK_HREF } from '../../src/shared/asset-publishing/fallbacks';
import { publicationFaceId, isPublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import type { Doc, Id } from '../_generated/dataModel';
import { publicationStatusFor } from '../assetPublishingStatus';
import type { MutationCtx, QueryCtx } from '../types';
import { supersedePendingPublication } from './publication';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;

/** The four token types, the set every back rule ranges over. */
export const TOKEN_ASSET_TYPES = new Set(['token-disc', 'token-tech', 'token-plate', 'token-enhance']);

/** A token's stored back, read without trusting the row to satisfy the current schema. */
export function tokenBackOf(data: unknown): { mode?: unknown; asset_id?: unknown } | null {
  const back = (data as { back?: unknown } | null | undefined)?.back;
  return typeof back === 'object' && back !== null ? (back as { mode?: unknown; asset_id?: unknown }) : null;
}

/** A deck's stored cardback, read the same distrustful way. Authored wears `mode: 'custom'` or, transitionally, no mode key; a reference wears `mode: 'reference'`. */
export function deckCardbackOf(data: unknown): { mode?: unknown; asset_id?: unknown } | Record<string, unknown> | null {
  const cardback = (data as { cardback?: unknown } | null | undefined)?.cardback;
  return typeof cardback === 'object' && cardback !== null ? (cardback as Record<string, unknown>) : null;
}

/**
 * The authored composition inside a stored cardback, or null when it is a reference.
 * The one three-way judgement (bare transitional, wrapped custom, reference) every server-side reader shares.
 */
export function cardbackComposition(cardback: Record<string, unknown>): Record<string, unknown> | null {
  if (!('mode' in cardback)) {
    return cardback;
  }
  if (cardback.mode !== 'custom') {
    return null;
  }
  const { mode: _mode, ...composition } = cardback;
  return composition;
}

/**
 * A deck row's authored cardback composition, or null when the row is not a live deck wearing one.
 * The one judgement of "can this deck's cardback be worn by someone else", shared by the browse presentation and the resolver so the dangling rules cannot fork.
 */
export function authoredDeckCardback(row: Doc<'assets'>): Record<string, unknown> | null {
  if (row.is_deleted || row.type !== 'deck') {
    return null;
  }
  const cardback = deckCardbackOf(row.data);
  return cardback ? cardbackComposition(cardback) : null;
}

/**
 * The target of a pre-migration `token-back` relation row.
 * Read only until `asset_relations_token_back_drop_v1` lands everywhere;
 * every transitional reader shares this one fallthrough.
 */
export async function legacyRelationBackId(ctx: ReadCtx, assetId: Id<'assets'>): Promise<Id<'assets'> | null> {
  const relation = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', assetId).eq('kind', 'token-back'))
    .first();
  return relation ? relation.to_asset_id : null;
}

/**
 * Whether a token row qualifies as a reference target («Which tokens are referenceable»): it must carry an authored back, so chains never form and the resolver never recurses.
 */
export function hasAuthoredBack(row: Doc<'assets'>): boolean {
  return tokenBackOf(row.data)?.mode === 'custom';
}

/**
 * The one validator for a token back reference, owned by the save path since the transitional pick mutation retired.
 * Returns the target row on success.
 * `_id` is null while creating, when self-reference cannot arise because the row has no id to name.
 */
export async function assertReferenceableTokenBack(
  ctx: ReadCtx,
  row: { _id: Id<'assets'> | null; type: string },
  targetId: Id<'assets'>
): Promise<Doc<'assets'>> {
  if (row._id !== null && targetId === row._id) {
    throw new ConvexError('A token cannot reference itself; use the same-front-and-back mode');
  }
  const target = await ctx.db.get('assets', targetId);
  if (!target || target.is_deleted) {
    throw new Error(`Asset with id ${targetId} not found`);
  }
  /* Same shape only: the back is the reverse of this physical piece, so a different shape would render clipped. */
  if (target.type !== row.type) {
    throw new ConvexError(`A ${row.type} backside must also be a ${row.type}`);
  }
  if (!hasAuthoredBack(target)) {
    throw new ConvexError('Only a token with an authored back can be referenced');
  }
  return target;
}

/** The deck counterpart: a cardback reference must name a deck whose cardback is authored. */
export async function assertReferenceableDeckCardback(
  ctx: ReadCtx,
  row: { _id: Id<'assets'> | null; type: string },
  targetId: Id<'assets'>
): Promise<Doc<'assets'>> {
  if (row._id !== null && targetId === row._id) {
    throw new ConvexError('A deck cannot reference its own cardback');
  }
  const target = await ctx.db.get('assets', targetId);
  if (!target || target.is_deleted) {
    throw new Error(`Asset with id ${targetId} not found`);
  }
  if (target.type !== 'deck') {
    throw new ConvexError('A cardback reference must name a deck');
  }
  const cardback = deckCardbackOf(target.data);
  if (!cardback || !cardbackComposition(cardback)) {
    throw new ConvexError('Only a deck with an authored cardback can be referenced');
  }
  return target;
}

/** The `.back` variant of `supersedePendingPublication`, named once so callers cannot mis-derive the face id. */
export async function supersedePendingBackJob(ctx: MutationCtx, assetType: string, assetId: Id<'assets'>) {
  await supersedePendingPublication(ctx, assetType, publicationFaceId(assetId, 'back'));
}

export type ResolvedBack = {
  mode: 'custom' | 'same' | 'reference' | 'authored-cardback' | 'dangling';
  /** The URL a consumer fetches for the back face, or null when nothing is published yet. */
  href: string | null;
};

/**
 * The one server-side answer to "what is this asset's back?" («What does each back mode publish»): authored → its own `.back` artifact, same → its own front, reference → the target's back, a dangling token → its own front, a dangling deck → the static fallback image.
 * Depth one always, since only authored backs are referenceable.
 */
export async function resolveBackHref(ctx: ReadCtx, row: Doc<'assets'>): Promise<ResolvedBack | null> {
  if (TOKEN_ASSET_TYPES.has(row.type)) {
    if (!isPublicationAssetType(row.type)) {
      return null;
    }
    const back = tokenBackOf(row.data);
    if (back?.mode === 'custom') {
      const status = await publicationStatusFor(ctx, row.type, publicationFaceId(row._id, 'back'));
      return { mode: 'custom', href: status?.publicationHref ?? null };
    }
    if (back?.mode === 'same' || back?.mode === 'reference') {
      /* The legacy fallthrough matches the save path's, so a pre-migration reference resolves to its target rather than reading as dangling during the deploy window. */
      const targetId =
        typeof back.asset_id === 'string'
          ? (back.asset_id as Id<'assets'>)
          : back.mode === 'reference'
            ? await legacyRelationBackId(ctx, row._id)
            : null;
      const target = targetId ? await ctx.db.get('assets', targetId) : null;
      if (
        back.mode === 'reference' &&
        target &&
        !target.is_deleted &&
        target.type === row.type &&
        hasAuthoredBack(target)
      ) {
        const status = await publicationStatusFor(ctx, row.type, publicationFaceId(target._id, 'back'));
        return { mode: 'reference', href: status?.publicationHref ?? null };
      }
      /* `same`, and every way a reference can dangle, resolve to the token's own front. */
      const status = await publicationStatusFor(ctx, row.type, row._id);
      return { mode: back.mode === 'same' ? 'same' : 'dangling', href: status?.publicationHref ?? null };
    }
    return null;
  }
  if (row.type === 'deck') {
    const cardback = deckCardbackOf(row.data);
    if (!cardback) {
      return null;
    }
    if (cardbackComposition(cardback)) {
      const status = await publicationStatusFor(ctx, 'deck', row._id);
      return { mode: 'authored-cardback', href: status?.publicationHref ?? null };
    }
    const targetId = typeof cardback.asset_id === 'string' ? (cardback.asset_id as Id<'assets'>) : null;
    const target = targetId ? await ctx.db.get('assets', targetId) : null;
    if (target && authoredDeckCardback(target)) {
      const status = await publicationStatusFor(ctx, 'deck', target._id);
      return { mode: 'reference', href: status?.publicationHref ?? null };
    }
    return { mode: 'dangling', href: NO_DECK_BACK_HREF };
  }
  return null;
}
