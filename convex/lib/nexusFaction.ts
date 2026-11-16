import type { QueryCtx } from '../types';
import { liveDefaultVariant, mergedInto } from './factionAddresses';
import { parseStoredFactionForRead } from './factionInput';

/*
 * A Nexus card links a whole Faction (#2921).
 * A card saved before that links one variant until `nexus_link_family_v1` moves its link to the variant's Faction.
 * The reads here still take a variant, for Play's seats, which carry variant ids, and for a card the move has not reached yet.
 */

type Reader = Pick<QueryCtx, 'db'>;

/**
 * What a Nexus card's link names, by the id it carries: a Faction with a live default variant, or on an older card one live variant.
 * Null for an id that names neither, and for a deleted or emptied Faction or a deleted variant.
 */
export async function nexusLinkTarget(ctx: Reader, id: string) {
  const familyId = ctx.db.normalizeId('faction_families', id);
  if (familyId) {
    const family = await mergedInto(ctx, await ctx.db.get('faction_families', familyId));
    const variant = await liveDefaultVariant(ctx, family);
    return family && variant ? { kind: 'faction' as const, family, variant } : null;
  }
  const variantId = ctx.db.normalizeId('factions', id);
  const variant = variantId ? await ctx.db.get('factions', variantId) : null;
  return variant && !variant.is_deleted ? { kind: 'variant' as const, variant } : null;
}

/**
 * The Faction a link leads to: a Faction's own id, or a live variant's Faction, so a stale draft, an old tab or an import binding that names a variant still stores the Faction.
 * Null where neither leads to a Faction with a live default variant.
 */
export async function nexusFactionTarget(ctx: Reader, id: string) {
  const target = await nexusLinkTarget(ctx, id);
  const faction = target?.kind === 'variant' ? await nexusLinkTarget(ctx, target.variant.family_id) : target;
  return faction?.kind === 'faction' ? faction : null;
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
