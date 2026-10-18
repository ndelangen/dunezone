import { withSupportNames } from '../../src/shared/factions/schema';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { slugify } from './utils';

/* Helpers the data migrations in `convex/migrations.ts` share; the migrations themselves stay there so their ids stay put. */

/** `base`, then `base-2`, `base-3` and on, until one is free. */
async function firstFreeSlug(base: string, isTaken: (slug: string) => Promise<boolean>) {
  let candidate = base;
  for (let suffix = 2; await isTaken(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

/** A slug only another row holds is taken; the row's own slug is free for it. */
function heldByOther(holder: { _id: string } | null, self: string | undefined) {
  return holder !== null && holder._id !== self;
}

/** The first free slug for a group or ruleset named `name`, keeping the row's own slug free for it. */
async function resolveUniqueSlug(
  ctx: QueryCtx | MutationCtx,
  table: 'groups' | 'rulesets',
  name: string,
  self: string | undefined
) {
  const holderOf = (slug: string) =>
    table === 'groups'
      ? ctx.db
          .query('groups')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .unique()
      : ctx.db
          .query('rulesets')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .unique();
  const fallback = table === 'groups' ? 'group' : 'ruleset';
  return await firstFreeSlug(slugify(name) || fallback, async (slug) => heldByOther(await holderOf(slug), self));
}

export const resolveUniqueGroupSlug = (ctx: QueryCtx | MutationCtx, name: string, groupId?: Id<'groups'>) =>
  resolveUniqueSlug(ctx, 'groups', name, groupId);

export const resolveUniqueRulesetSlug = (ctx: QueryCtx | MutationCtx, name: string, rulesetId?: Id<'rulesets'>) =>
  resolveUniqueSlug(ctx, 'rulesets', name, rulesetId);

export function missingSlug(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

async function faqSlugCounter(ctx: MutationCtx, key: string) {
  const counter = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return counter ?? { _id: await ctx.db.insert('counters', { key, value: 0 }), value: 0 };
}

export async function allocateNextFaqItemSlug(ctx: MutationCtx, rulesetId: Id<'rulesets'>): Promise<string> {
  const counter = await faqSlugCounter(ctx, `faq_item_slug:${rulesetId}`);
  let candidate = counter.value + 1;
  const isTaken = async (slug: string) =>
    (await ctx.db
      .query('faq_items')
      .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', rulesetId).eq('slug', slug))
      .unique()) !== null;
  while (await isTaken(String(candidate))) {
    candidate += 1;
  }
  await ctx.db.patch(counter._id, { value: candidate });
  return String(candidate);
}

type StoredTroopFace = { combat?: unknown; back?: StoredTroopFace };

function hasLegacySupportNames(combat: unknown): boolean {
  return typeof combat === 'object' && combat !== null && ('fundedStrength' in combat || 'fundingCost' in combat);
}

export function troopHasLegacySupportNames(troop: unknown): boolean {
  const face = troop as StoredTroopFace | null;
  return hasLegacySupportNames(face?.combat) || hasLegacySupportNames(face?.back?.combat);
}

/** A face with its `combat` renamed, if it has one; every other field stays as stored. */
function faceWithSupportNames(face: StoredTroopFace): StoredTroopFace {
  return face.combat === undefined ? face : { ...face, combat: withSupportNames(face.combat) };
}

/* Only `combat` is rewritten, on the front and on an authored back; every other troop field stays as stored. */
export function troopWithSupportNames(troop: unknown): unknown {
  if (typeof troop !== 'object' || troop === null) {
    return troop;
  }
  const face = faceWithSupportNames(troop as StoredTroopFace);
  const back = face.back && typeof face.back === 'object' ? faceWithSupportNames(face.back) : face.back;
  return back === face.back ? face : { ...face, back };
}
