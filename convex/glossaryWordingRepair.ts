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
import type { MutationCtx } from './types';

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

type Field = [holder: Record<string, any> | undefined, key: string, path: string];

const listed = (items: unknown): Record<string, any>[] => (Array.isArray(items) ? items : []);

/* Where a faction keeps its prose: names, ids and image paths keep their spelling. */
function proseFields(data: Record<string, any>): Field[] {
  const rules = data.rules;
  return [
    [rules, 'startText', 'rules.startText'],
    [rules, 'revivalText', 'rules.revivalText'],
    ...listed(rules?.advantages).flatMap((rule, index): Field[] =>
      ['title', 'text', 'karama'].map((key) => [rule, key, `rules.advantages[${index}].${key}`])
    ),
    [rules?.fate, 'title', 'rules.fate.title'],
    [rules?.fate, 'text', 'rules.fate.text'],
    [rules?.alliance, 'text', 'rules.alliance.text'],
    ...listed(data.troops).flatMap((troop, index): Field[] => [
      [troop, 'description', `troops[${index}].description`],
      [troop.back, 'description', `troops[${index}].back.description`],
    ]),
    ...listed(data.planet).map((planet, index): Field => [planet, 'description', `planet[${index}].description`]),
    [data, 'about', 'about'],
  ];
}

function fixFactionProse(data: Record<string, any>) {
  const next = structuredClone(data);
  const changes: Change[] = [];
  for (const [holder, key, path] of proseFields(next)) {
    const before = holder?.[key];
    const after = typeof before === 'string' ? fixProse(before) : before;
    if (after !== before) {
      holder![key] = after;
      changes.push({ path, before, after });
    }
  }
  return { next, changes };
}

function fixSeedString(value: string, path: string, changes: Change[]) {
  const after = GF9_SEED_WORDING.get(value) ?? value;
  if (after !== value) {
    changes.push({ path, before: value, after });
  }
  return after;
}

/* Replaces every string that still reads exactly as the old GF9 seed text. */
function fixSeedStrings(value: unknown, path: string, changes: Change[]): unknown {
  if (typeof value === 'string') {
    return fixSeedString(value, path, changes);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => fixSeedStrings(item, `${path}[${index}]`, changes));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [
      key,
      fixSeedStrings(item, path ? `${path}.${key}` : key, changes),
    ]);
    return Object.fromEntries(entries);
  }
  return value;
}

async function repairFaction(ctx: MutationCtx, slug: string, dryRun: boolean) {
  const row = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) {
    return 'missing' as const;
  }
  const { next, changes } = fixFactionProse(row.data);
  if (changes.length > 0 && !dryRun) {
    await ctx.db.patch('factions', row._id, { data: next, updated_at: nowIso() });
    const updated = { ...row, data: next };
    await enqueueFactionSheetPublication(ctx, updated);
    await enqueueFactionFaces(ctx, updated, row.data);
  }
  return changes;
}

async function repairStockCards(ctx: MutationCtx, type: string, ownerId: Id<'users'>, dryRun: boolean) {
  const rows = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
    .collect();
  const repaired: { id: Id<'assets'>; type: string; slug: string; changes: Change[] }[] = [];
  for (const row of rows.filter((candidate) => candidate.owner_id === ownerId)) {
    const changes: Change[] = [];
    const data = fixSeedStrings(row.data, '', changes);
    if (changes.length === 0) {
      continue;
    }
    repaired.push({ id: row._id, type, slug: row.slug, changes });
    if (!dryRun) {
      await ctx.db.patch('assets', row._id, { data, updated_at: nowIso() });
      await enqueueAssetPublication(ctx, { ...row, data });
    }
  }
  return repaired;
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
      const changes = await repairFaction(ctx, slug, args.dryRun);
      if (changes === 'missing') {
        missingFactions.push(slug);
      } else if (changes.length > 0) {
        factions.push({ slug, changes });
      }
    }
    const assets = [];
    for (const type of STOCK_CARD_TYPES) {
      assets.push(...(await repairStockCards(ctx, type, args.ownerId, args.dryRun)));
    }
    return { factions, assets, missingFactions };
  },
});
