import type { QueryCtx } from '../types';
import { liveDefaultVariant } from './factionAddresses';
import { parseStoredFactionForRead } from './factionInput';

/*
 * A Nexus card links a whole Faction (#2921).
 * A card saved before that links one variant, and keeps working until its link is moved to the variant's Faction.
 */

type Reader = Pick<QueryCtx, 'db'>;

/**
 * What a Nexus card's link names, by the id it carries: a Faction with a live default variant, or on an older card one live variant.
 * Null for an id that names neither, and for a deleted or emptied Faction or a deleted variant.
 */
export async function nexusLinkTarget(ctx: Reader, id: string) {
  const familyId = ctx.db.normalizeId('faction_families', id);
  if (familyId) {
    const family = await ctx.db.get('faction_families', familyId);
    const variant = await liveDefaultVariant(ctx, family);
    return family && variant ? { kind: 'faction' as const, family, variant } : null;
  }
  const variantId = ctx.db.normalizeId('factions', id);
  const variant = variantId ? await ctx.db.get('factions', variantId) : null;
  return variant && !variant.is_deleted ? { kind: 'variant' as const, variant } : null;
}

type NexusLinkTarget = NonNullable<Awaited<ReturnType<typeof nexusLinkTarget>>>;

/** The link as the card stores it: the id with the address it leads to. */
export function nexusLinkOf(target: NexusLinkTarget) {
  const { _id, slug } = target.kind === 'faction' ? target.family : target.variant;
  return { id: _id, slug };
}

/** The name, emblem and background a card draws: the Faction's shared ones, or its variant's while those do not parse. */
export function nexusLinkFace(target: NexusLinkTarget) {
  const shared = target.kind === 'faction' ? target.family.data : null;
  const { name, emblem, background } = shared ?? parseStoredFactionForRead(target.variant.data);
  return { name, emblem, background };
}
