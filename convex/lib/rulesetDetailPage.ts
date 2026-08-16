import { CanonicalFactionStoredSchema } from '../../src/shared/factions/schema';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { loadAssetAccessBundle, loadRulesetAccessForLoadedSubject } from './collaborativeAccess';
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
 * Degradation rule: a linked faction whose stored data fails the canonical schema is still listed (identity chips are optional), rendered with a null identity rather than hiding the link or failing the page.
 */
function factionIdentityForClient(data: unknown) {
  const parsedFaction = CanonicalFactionStoredSchema.safeParse(data);
  if (!parsedFaction.success) {
    return null;
  }
  return {
    logo: parsedFaction.data.logo,
    background: parsedFaction.data.background,
  };
}

/**
 * Name rule: a faction row whose data carries no readable name falls back to its durable id so the link stays navigable; soft-deleted and dangling links are dropped.
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
    const dataObj =
      faction.data != null && typeof faction.data === 'object' && !Array.isArray(faction.data)
        ? (faction.data as Record<string, unknown>)
        : null;
    const name = typeof dataObj?.name === 'string' ? dataObj.name : String(faction._id);
    return [
      {
        factionId: faction._id,
        name,
        urlSlug: faction.slug,
        identity: factionIdentityForClient(faction.data),
      },
    ];
  });
}

/**
 * Ruleset public-page read model behind `api.rulesets.getBySlug` and `api.rulesets.detailPageBySlug`.
 * Owns slug resolution, the soft-delete gate, the faction listing with its degradation rules, and viewer access; the wire contracts are `rulesetPublicBundleValidator` / `rulesetDetailPageValidator`.
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
