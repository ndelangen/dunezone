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
  /* By the variant's own creation date, which matches the switcher's oldest-first order but for rows imported with an older date. */
  const rest = [...bySource.values()].sort(
    (left, right) => left.created_at - right.created_at || compareCodeUnits(left.source_id, right.source_id)
  );
  return [...ordered, ...rest];
}

/**
 * The live variants' `'all'` entries, at most `VARIANT_LISTING_LIMIT` of them.
 * The default and the variants its maintainers ordered are read first, so the limit never leaves them out, as with `liveVariantsInOrder`.
 */
async function liveVariantEntries(ctx: QueryCtx, family: Doc<'faction_families'>) {
  const entries = new Map<string, VariantEntry>();
  for (const id of [family.default_variant_id, ...(family.variant_order ?? [])]) {
    if (entries.size === VARIANT_LISTING_LIMIT || entries.has(id)) {
      continue;
    }
    const entry = await ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind_source', (q) => q.eq('kind', 'faction').eq('source_id', id).eq('partition', ALL_PARTITION))
      .first();
    if (entry?.family_id === family._id) {
      entries.set(id, entry);
    }
  }
  for await (const entry of ctx.db
    .query('catalogue_entries')
    .withIndex('by_kind_family', (q) =>
      q.eq('kind', 'faction').eq('family_id', family._id).eq('partition', ALL_PARTITION)
    )) {
    if (entries.size === VARIANT_LISTING_LIMIT) {
      break;
    }
    entries.set(entry.source_id, entry);
  }
  return [...entries.values()];
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
  const links = new Map<string, VariantEntry>();
  for (const variant of variants) {
    for (const facet of variant.facets) {
      if (!isOwnerFacet(facet) && !links.has(facet)) {
        links.set(facet, variant);
      }
    }
  }
  return links;
}

/** One row per list must fit in what a reconcile reads of a source, the `'all'` list included. */
const FAMILY_FACET_LIMIT = 1023;

function cappedFacets(family: Doc<'faction_families'>, facets: string[]) {
  if (facets.length > FAMILY_FACET_LIMIT) {
    console.warn(
      `Faction ${family._id} is in ${facets.length} lists; the catalogue lists it under the first ${FAMILY_FACET_LIMIT}.`
    );
  }
  return facets.slice(0, FAMILY_FACET_LIMIT);
}

/**
 * The Faction kind of `catalogue_entries`: one entry per Faction with a live variant, built from its variants' slim entries rather than their data (#2929).
 * It lists under every ruleset any variant is linked to, and under the Faction's owner and every variant's owner.
 * On a ruleset's list the entry leads to, and draws the card of, the first variant linked to it.
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
    const partitionOverrides = Object.fromEntries(
      [...deepLinks]
        .filter(([, variant]) => variant.source_id !== lead.source_id)
        .map(([partition, variant]) => [partition, { slug: variant.slug, card_source_id: variant.source_id }])
    );
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
      facets: cappedFacets(family, [
        ...[...deepLinks.keys()].sort(compareCodeUnits),
        ...[...owners].sort(compareCodeUnits),
      ]),
      variant_count: variants.length,
      card_source_id: lead.source_id,
      ...(Object.keys(partitionOverrides).length > 0 ? { partitionOverrides } : {}),
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db.query('faction_families').take(limit);
    return rows.filter((row) => !row.is_deleted).map((row) => row._id);
  },
};
