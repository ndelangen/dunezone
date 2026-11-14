import { compareCodeUnits } from '../../src/shared/compareText';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';
import { ALL_PARTITION } from './catalogueOrder';
import { factionOwnerPartition } from './factionCatalogue';
import { VARIANT_LISTING_LIMIT } from './factionFamilies';

type VariantEntry = Doc<'catalogue_entries'>;

/** A variant entry's facet that names its owner, not a ruleset it is linked to. */
function isOwnerFacet(facet: string) {
  return facet.startsWith('owner:');
}

/**
 * The Faction's live variants' entries in listing order: the default first, then the order its maintainers gave, then the rest oldest first (#2928).
 * The same order as `liveVariantsInOrder`, read from the slim entries, so a ruleset list deep-links to the variant the switcher lists first.
 */
function variantEntriesInOrder(family: Doc<'faction_families'>, entries: readonly VariantEntry[]) {
  const bySource = new Map(entries.map((entry) => [entry.source_id, entry]));
  const ordered: VariantEntry[] = [];
  for (const id of [family.default_variant_id, ...(family.variant_order ?? [])]) {
    const entry = bySource.get(id);
    if (entry) {
      ordered.push(entry);
      bySource.delete(id);
    }
  }
  const rest = [...bySource.values()].sort(
    (left, right) => left.created_at - right.created_at || compareCodeUnits(left.source_id, right.source_id)
  );
  return [...ordered, ...rest];
}

async function liveVariantEntries(ctx: QueryCtx, family: Doc<'faction_families'>) {
  return await ctx.db
    .query('catalogue_entries')
    .withIndex('by_kind_family', (q) =>
      q.eq('kind', 'faction').eq('family_id', family._id).eq('partition', ALL_PARTITION)
    )
    .take(VARIANT_LISTING_LIMIT);
}

/** Every distinct line of the variants' search text, so a Faction is found by any variant's names. */
function familySearchText(variants: readonly VariantEntry[]) {
  return [...new Set(variants.flatMap((variant) => variant.search_text.split('\n')))].join('\n');
}

/** The newest moment any variant was created or saved: a new variant updates its Faction and is never a new arrival (#2912). */
function latestVariantChange(variants: readonly VariantEntry[]) {
  return Math.max(...variants.map((variant) => Math.max(variant.created_at, variant.updated_at)));
}

/** Each ruleset any variant is linked to, with the address of the first variant in listing order that is (#2912). */
function rulesetDeepLinks(variants: readonly VariantEntry[]) {
  const links = new Map<string, string>();
  for (const variant of variants) {
    for (const facet of variant.facets) {
      if (!isOwnerFacet(facet) && !links.has(facet)) {
        links.set(facet, variant.slug);
      }
    }
  }
  return links;
}

/**
 * The Faction kind of `catalogue_entries`: one entry per Faction with a live variant, built from its variants' slim entries rather than their data (#2929).
 * It lists under every ruleset any variant is linked to, and under the Faction's owner and every variant's owner.
 * On a ruleset's list the entry leads to the first variant linked to it.
 * Everywhere else it leads to the Faction's own address, which opens its default variant.
 */
export const factionFamilyCatalogueKind: CatalogueKind = {
  sorts: ['name', 'created', 'updated', 'complexity'],
  expected: async (ctx, sourceId) => {
    const familyId = ctx.db.normalizeId('faction_families', sourceId);
    const family = familyId ? await ctx.db.get('faction_families', familyId) : null;
    if (!family || family.is_deleted) {
      return null;
    }
    const variants = variantEntriesInOrder(family, await liveVariantEntries(ctx, family));
    const lead = variants[0];
    if (!lead) {
      return null;
    }
    const createdAt = catalogueTimestamp(family.created_at);
    const changedAt = latestVariantChange(variants);
    const deepLinks = rulesetDeepLinks(variants);
    const owners = new Set([
      factionOwnerPartition(family.owner_id),
      ...variants.flatMap((variant) => variant.facets.filter(isOwnerFacet)),
    ]);
    const partitionSlugs = Object.fromEntries([...deepLinks].filter(([, slug]) => slug !== family.slug));
    return {
      kind: 'faction_family',
      source_id: family._id,
      slug: family.slug,
      search_text: familySearchText(variants),
      name_key: lead.name_key,
      created_at: createdAt,
      updated_at: Math.max(createdAt, changedAt),
      edited_at: createdAt > 0 && changedAt > createdAt ? changedAt : 0,
      complexity: lead.complexity,
      complexity_score: lead.complexity_score,
      complexity_scores: [...new Set(variants.map((variant) => variant.complexity_score))].sort((a, b) => a - b),
      facets: [...[...deepLinks.keys()].sort(compareCodeUnits), ...[...owners].sort(compareCodeUnits)],
      variant_count: variants.length,
      card_source_id: lead.source_id,
      ...(Object.keys(partitionSlugs).length > 0 ? { partitionSlugs } : {}),
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db.query('faction_families').take(limit);
    return rows.filter((row) => !row.is_deleted).map((row) => row._id);
  },
};
