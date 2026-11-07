import { v } from 'convex/values';

import { fixTermWording } from '../src/shared/glossary/hints';
import { internalMutation } from './functions';
import { enqueueFactionFaces, enqueueFactionSheetPublication } from './lib/publication';
import { nowIso } from './lib/utils';
import type { MutationCtx } from './types';

type Change = { path: string; before: string; after: string };

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

/* A special rule played with the faction's fate card belongs under the Fate heading (Norbert, 2026-11-07). */
const PLAYS_FATE_CARD = /\bplay your fate\b/i;

function fixProse(data: Record<string, any>): Change[] {
  const changes: Change[] = [];
  for (const [holder, key, path] of proseFields(data)) {
    const before = holder?.[key];
    if (typeof before !== 'string') {
      continue;
    }
    const after = fixTermWording(before);
    if (after !== before) {
      holder![key] = after;
      changes.push({ path, before, after });
    }
  }
  return changes;
}

const playsFateCard = (fate: Record<string, any> | undefined) =>
  fate?.label === undefined && PLAYS_FATE_CARD.test(String(fate?.text ?? ''));

function repairData(data: Record<string, any>) {
  const next = structuredClone(data);
  const changes = fixProse(next);
  const fate = next.rules?.fate;
  if (fate && playsFateCard(fate)) {
    fate.label = 'fate';
    changes.push({ path: 'rules.fate.label', before: '', after: 'fate' });
  }
  return { next, changes };
}

async function repairFaction(ctx: MutationCtx, slug: string, dryRun: boolean) {
  const row = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) {
    return 'missing' as const;
  }
  const { next, changes } = repairData(row.data);
  if (changes.length > 0 && !dryRun) {
    await ctx.db.patch('factions', row._id, { data: next, updated_at: nowIso() });
    const updated = { ...row, data: next };
    await enqueueFactionSheetPublication(ctx, updated);
    await enqueueFactionFaces(ctx, updated, row.data);
  }
  return changes;
}

const changeValidator = v.object({ path: v.string(), before: v.string(), after: v.string() });

/*
 * One-off repair for the named stock factions (thread "Check blog posts against glossary", 2026-11-07):
 * their prose goes through the glossary's current fixes (player shield to faction shield, among others),
 * and a special rule played with a fate card gets the Fate heading. `dryRun` reports without writing.
 */
export const run = internalMutation({
  args: {
    factionSlugs: v.array(v.string()),
    dryRun: v.boolean(),
  },
  returns: v.object({
    factions: v.array(v.object({ slug: v.string(), changes: v.array(changeValidator) })),
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
    return { factions, missingFactions };
  },
});
