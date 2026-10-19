/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import type { Id } from './_generated/dataModel';
import type { factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

export const CATALOGUE_STAMP = '2026-07-01T00:00:00.000Z';

export type SeededFaction = {
  name: string;
  factionLeader?: string;
  leaders?: string[];
  created?: string;
  updated?: string;
  complexity?: number;
  /** Ruleset slugs this faction is linked to. */
  rulesets?: string[];
  deleted?: boolean;
};

export type SeededRuleset = { slug: string; name: string; deleted?: boolean };

/** The authored blob of a catalogue faction: the shared fixture under a new name, leaders and complexity. */
export function catalogueFactionData(faction: SeededFaction) {
  return {
    ...assetPublishingFaction,
    name: faction.name,
    ...(faction.complexity == null ? {} : { complexity: { calculated: faction.complexity } }),
    factionLeader: { ...assetPublishingFaction.factionLeader, name: faction.factionLeader ?? 'Lady Jessica' },
    leaders: (faction.leaders ?? ['Duncan Idaho']).map((leader, index) => ({
      ...assetPublishingFaction.leaders[index % assetPublishingFaction.leaders.length]!,
      name: leader,
    })),
  };
}

/**
 * Seeds rulesets, factions and their links through the application's triggers, as every deployed writer does, so the catalogue entries are maintained exactly as in production.
 */
export async function seedCatalogue(
  t: ReturnType<typeof factionTest>,
  factions: SeededFaction[],
  rulesets: SeededRuleset[] = []
) {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ownerId = await ctx.db.insert('users', { name: 'Catalogue owner' });
    const rulesetIds = new Map<string, Id<'rulesets'>>();
    for (const ruleset of rulesets) {
      rulesetIds.set(
        ruleset.slug,
        await ctx.db.insert('rulesets', {
          name: ruleset.name,
          about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
          slug: ruleset.slug,
          created_at: CATALOGUE_STAMP,
          updated_at: CATALOGUE_STAMP,
          owner_id: ownerId,
          group_id: null,
          is_deleted: ruleset.deleted ?? false,
          image_cover: null,
        })
      );
    }
    const factionIds: Id<'factions'>[] = [];
    for (const [index, faction] of factions.entries()) {
      const factionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: catalogueFactionData(faction),
        slug: `${faction.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${index}`,
        created_at: faction.created ?? CATALOGUE_STAMP,
        updated_at: faction.updated ?? faction.created ?? CATALOGUE_STAMP,
        is_deleted: faction.deleted ?? false,
        group_id: null,
      });
      factionIds.push(factionId);
      for (const slug of faction.rulesets ?? []) {
        await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetIds.get(slug)!, faction_id: factionId });
      }
    }
    return { ownerId, factionIds, rulesetIds: Object.fromEntries(rulesetIds) };
  });
}
