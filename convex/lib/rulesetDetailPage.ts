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
  };
}
