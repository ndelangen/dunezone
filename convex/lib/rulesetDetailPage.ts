import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { loadAssetAccessBundle, loadRulesetAccessForLoadedSubject } from './collaborativeAccess';
import { parseStoredFactionForRead } from './factionInput';
import { loadFaqItemsForRuleset } from './faqRulesetList';
import { profileSummary } from './profileSummary';

const RULESET_FACTION_LIMIT = 500;

/** A non-deleted ruleset resolved by its public slug, or null. The one soft-delete gate. */
export async function loadPublicRulesetBySlug(ctx: QueryCtx, slug: string): Promise<Doc<'rulesets'> | null> {
  const row = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) {
    return null;
  }
  return row;
}

/**
 * The linked factions, in the same shape the catalogue puts on the wire, so a ruleset's page can render them with the same vocabulary.
 * Stored data is parsed the way the catalogue parses it — an unreadable row throws rather than degrading, because the app already bets everywhere else that faction data parses.
 * Soft-deleted and dangling links are dropped.
 *
 * `rulesets` is deliberately empty: these factions are already being read *inside* one ruleset, so captioning each card with a ruleset name would repeat the page's own subject back at the reader.
 * Callers that need the full list have the catalogue for it.
 */
async function listPublicRulesetFactions(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(RULESET_FACTION_LIMIT);
  const factions = await Promise.all(links.map((link) => ctx.db.get('factions', link.faction_id)));

  return factions.flatMap((faction) => {
    if (!faction || faction.is_deleted) {
      return [];
    }
    return [{ ...faction, data: parseStoredFactionForRead(faction.data), rulesets: [] }];
  });
}

/**
 * Ruleset public-page read model behind `api.rulesets.getBySlug` and `api.rulesets.detailPageBySlug`.
 * Owns slug resolution, the soft-delete gate, the faction listing with its degradation rules, and viewer access;
 * the wire contracts are `rulesetPublicBundleValidator` / `rulesetDetailPageValidator`.
 */
export async function loadRulesetPublicBundleBySlug(ctx: QueryCtx, slug: string) {
  const row = await loadPublicRulesetBySlug(ctx, slug);
  if (!row) {
    throw new Error(`Ruleset with slug ${slug} not found`);
  }
  const access = await loadRulesetAccessForLoadedSubject(ctx, row);
  return {
    ruleset: row,
    factions: await listPublicRulesetFactions(ctx, row._id),
    viewerAccess: access.viewerAccess,
  };
}

/** Bounds one ruleset's slot contents. Slots are curated by hand, so this is a ceiling on nonsense rather than a paging limit. */
const RULESET_SLOT_LIMIT = 200;

/**
 * The assets a ruleset has slotted, by slot.
 *
 * A soft-deleted asset is filtered here rather than having its row removed, which is the same bargain `listPublicRulesetFactions` makes just above: the slot row survives, the slot presents empty, and undeleting the asset restores it.
 * Reads `by_ruleset` only.
 * The reverse view, which rulesets link a given asset, is «A deck's linking rulesets, on its detail page» and owns `by_asset`.
 */
async function listRulesetAssetSlots(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const rows = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(RULESET_SLOT_LIMIT);

  const entries = [];
  for (const row of rows) {
    const asset = await ctx.db.get('assets', row.asset_id);
    if (asset && !asset.is_deleted) {
      entries.push({
        slot: row.slot,
        asset: {
          id: asset._id,
          type: asset.type,
          slug: asset.slug,
          name: assetDisplayName(asset),
        },
      });
    }
  }
  return entries;
}

/** The stored `name` inside an untyped `data` blob, with the same fallback every catalogue surface uses. */
function assetDisplayName(asset: Doc<'assets'>): string {
  const data = asset.data as { name?: unknown } | null | undefined;
  return typeof data?.name === 'string' && data.name.trim() ? data.name : 'Untitled';
}

export async function loadRulesetDetailPageBySlug(ctx: QueryCtx, slug: string) {
  const row = await loadPublicRulesetBySlug(ctx, slug);
  if (!row) {
    return null;
  }
  const access = await loadAssetAccessBundle(ctx, { kind: 'ruleset', row });
  return {
    ruleset: row,
    factions: await listPublicRulesetFactions(ctx, row._id),
    viewerAccess: access.viewerAccess,
    faqItems: await loadFaqItemsForRuleset(ctx, row._id),
    owner: await profileSummary(ctx, row.owner_id),
    assignableGroups: access.assignableGroups,
    assetSlots: await listRulesetAssetSlots(ctx, row._id),
  };
}
