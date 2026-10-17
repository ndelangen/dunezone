import { v } from 'convex/values';

import {
  LEADER_SKILL_ASSET_TYPE,
  NEXUS_CARD_ASSET_TYPE,
  STORM_CARD_ASSET_TYPE,
  STRONGHOLD_CARD_ASSET_TYPE,
} from '../src/shared/asset-publishing/publication';
import { fixTermWording } from '../src/shared/glossary/hints';
import type { Id } from './_generated/dataModel';
import { internalMutation } from './functions';
import { GF9_SEED_WORDING } from './lib/glossaryStockWording';
import { enqueueAssetPublication, enqueueFactionFaces, enqueueFactionSheetPublication } from './lib/publication';
import { nowIso } from './lib/utils';

/* A typo in the stock Atreides text that the glossary hints do not catch. */
const EXTRA_FIXES: readonly [RegExp, string][] = [[/\bKwiatz Haderach\b/g, 'Kwisatz Haderach']];

const STOCK_CARD_TYPES = [
  LEADER_SKILL_ASSET_TYPE,
  NEXUS_CARD_ASSET_TYPE,
  STRONGHOLD_CARD_ASSET_TYPE,
  STORM_CARD_ASSET_TYPE,
] as const;

type Change = { path: string; before: string; after: string };

function fixProse(text: string) {
  return EXTRA_FIXES.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    fixTermWording(text)
  );
}

/* Only the faction's prose: names, ids and image paths keep their spelling. */
function fixFactionProse(data: Record<string, any>) {
  const changes: Change[] = [];
  const next = structuredClone(data);
  const fix = (holder: Record<string, any> | undefined, key: string, path: string) => {
    const before = holder?.[key];
    if (typeof before !== 'string') {
      return;
    }
    const after = fixProse(before);
    if (after !== before) {
      holder![key] = after;
      changes.push({ path, before, after });
    }
  };
  const rules = next.rules;
  fix(rules, 'startText', 'rules.startText');
  fix(rules, 'revivalText', 'rules.revivalText');
  (rules?.advantages ?? []).forEach((rule: Record<string, any>, index: number) => {
    fix(rule, 'title', `rules.advantages[${index}].title`);
    fix(rule, 'text', `rules.advantages[${index}].text`);
    fix(rule, 'karama', `rules.advantages[${index}].karama`);
  });
  fix(rules?.fate, 'title', 'rules.fate.title');
  fix(rules?.fate, 'text', 'rules.fate.text');
  fix(rules?.alliance, 'text', 'rules.alliance.text');
  (next.troops ?? []).forEach((troop: Record<string, any>, index: number) => {
    fix(troop, 'description', `troops[${index}].description`);
    fix(troop.back, 'description', `troops[${index}].back.description`);
  });
  (next.planet ?? []).forEach((planet: Record<string, any>, index: number) => {
    fix(planet, 'description', `planet[${index}].description`);
  });
  fix(next, 'about', 'about');
  return { next, changes };
}

/* Replaces every string that still reads exactly as the old GF9 seed text. */
function fixSeedStrings(value: unknown, path: string, changes: Change[]): unknown {
  if (typeof value === 'string') {
    const after = GF9_SEED_WORDING.get(value);
    if (after === undefined) {
      return value;
    }
    changes.push({ path, before: value, after });
    return after;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => fixSeedStrings(item, `${path}[${index}]`, changes));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fixSeedStrings(item, path ? `${path}.${key}` : key, changes)])
    );
  }
  return value;
}

const changeValidator = v.object({ path: v.string(), before: v.string(), after: v.string() });

/*
 * One-off repair that brings stock content in line with the glossary (thread "Wording hunt", 2026-10-17).
 * Factions are named by slug; their prose goes through the glossary's own fixes. Stock cards owned by
 * `ownerId` change only where a string still equals the old GF9 seed text. `dryRun` reports without writing.
 */
export const run = internalMutation({
  args: {
    factionSlugs: v.array(v.string()),
    ownerId: v.id('users'),
    dryRun: v.boolean(),
  },
  returns: v.object({
    factions: v.array(v.object({ slug: v.string(), changes: v.array(changeValidator) })),
    assets: v.array(
      v.object({ id: v.id('assets'), type: v.string(), slug: v.string(), changes: v.array(changeValidator) })
    ),
    missingFactions: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const factions = [];
    const missingFactions = [];
    for (const slug of args.factionSlugs) {
      const row = await ctx.db
        .query('factions')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique();
      if (!row || row.is_deleted) {
        missingFactions.push(slug);
        continue;
      }
      const { next, changes } = fixFactionProse(row.data);
      if (changes.length === 0) {
        continue;
      }
      factions.push({ slug, changes });
      if (!args.dryRun) {
        await ctx.db.patch('factions', row._id, { data: next, updated_at: nowIso() });
        const updated = { ...row, data: next };
        await enqueueFactionSheetPublication(ctx, updated);
        await enqueueFactionFaces(ctx, updated, row.data);
      }
    }

    const assets: { id: Id<'assets'>; type: string; slug: string; changes: Change[] }[] = [];
    for (const type of STOCK_CARD_TYPES) {
      const rows = await ctx.db
        .query('assets')
        .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
        .collect();
      for (const row of rows.filter((candidate) => candidate.owner_id === args.ownerId)) {
        const changes: Change[] = [];
        const data = fixSeedStrings(row.data, '', changes);
        if (changes.length === 0) {
          continue;
        }
        assets.push({ id: row._id, type, slug: row.slug, changes });
        if (!args.dryRun) {
          await ctx.db.patch('assets', row._id, { data, updated_at: nowIso() });
          await enqueueAssetPublication(ctx, { ...row, data });
        }
      }
    }
    return { factions, assets, missingFactions };
  },
});
