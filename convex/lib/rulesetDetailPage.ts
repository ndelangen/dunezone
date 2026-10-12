import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { assignedGroupSummary, loadAssetAccessBundle, loadRulesetAccessForLoadedSubject } from './collaborativeAccess';
import { toCatalogueFaction } from './factionCatalogue';
import { loadFaqItemsForRuleset } from './faqRulesetList';
import { profileSummary } from './profileSummary';
import { listRulesetRulebooks } from './rulebookList';
import { listRulesetAssetSlots } from './rulesetSlots';

const RULESET_FACTION_LIMIT = 500;

/** A non-deleted ruleset resolved by its public slug, or null. The one soft-delete gate. */
export async function loadPublicRulesetBySlug(ctx: QueryCtx, slug: string) {
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
 * Stored data is parsed the way the catalogue parses it: an unreadable row throws rather than degrading, because the app already bets everywhere else that faction data parses.
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
    return [toCatalogueFaction(faction, [])];
  });
}

/** The ruleset and its factions, the same for every viewer: behind `api.rulesets.page`. Throws for an unknown slug, as `getBySlug` does. */
export async function loadRulesetPageBySlug(ctx: QueryCtx, slug: string) {
  const row = await loadPublicRulesetBySlug(ctx, slug);
  if (!row) {
    throw new Error(`Ruleset with slug ${slug} not found`);
  }
  return { ruleset: row, factions: await listPublicRulesetFactions(ctx, row._id) };
}

/** The ruleset detail page, the same for every viewer: behind `api.rulesets.detailPage`. Null for an unknown slug. */
export async function loadRulesetPublicDetailPageBySlug(ctx: QueryCtx, slug: string) {
  const row = await loadPublicRulesetBySlug(ctx, slug);
  if (!row) {
    return null;
  }
  return {
    ruleset: row,
    factions: await listPublicRulesetFactions(ctx, row._id),
    assignedGroup: await assignedGroupSummary(ctx, row.group_id),
    faqItems: await loadFaqItemsForRuleset(ctx, row._id),
    owner: await profileSummary(ctx, row.owner_id),
    assetSlots: await listRulesetAssetSlots(ctx, row._id),
    rulebooks: await listRulesetRulebooks(ctx, row._id),
  };
}

/** Deprecated with `api.rulesets.getBySlug`: the public page plus the viewer's access. Remove with it. */
export async function loadRulesetPublicBundleBySlug(ctx: QueryCtx, slug: string) {
  const page = await loadRulesetPageBySlug(ctx, slug);
  const access = await loadRulesetAccessForLoadedSubject(ctx, page.ruleset);
  return { ...page, viewerAccess: access.viewerAccess };
}

/** Deprecated with `api.rulesets.detailPageBySlug`: the public detail page with the viewer's access in place of `assignedGroup`. Remove with it. */
export async function loadRulesetDetailPageBySlug(ctx: QueryCtx, slug: string) {
  const page = await loadRulesetPublicDetailPageBySlug(ctx, slug);
  if (!page) {
    return null;
  }
  const { assignedGroup: _assignedGroup, ...rest } = page;
  const access = await loadAssetAccessBundle(ctx, { kind: 'ruleset', row: page.ruleset });
  return { ...rest, viewerAccess: access.viewerAccess, assignableGroups: access.assignableGroups };
}
