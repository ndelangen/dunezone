import { withSupportNames } from '../../src/shared/factions/schema';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { slugify } from './utils';

/* Helpers the data migrations in `convex/migrations.ts` share; the migrations themselves stay there so their ids stay put. */

export async function resolveUniqueGroupSlug(ctx: QueryCtx | MutationCtx, name: string, groupId?: Id<'groups'>) {
  const baseSlug = slugify(name) || 'group';
  let candidate = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query('groups')
      .withIndex('by_slug', (q) => q.eq('slug', candidate))
      .unique();
    if (!existing || (groupId && existing._id === groupId)) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

export async function resolveUniqueRulesetSlug(ctx: QueryCtx | MutationCtx, name: string, rulesetId?: Id<'rulesets'>) {
  const baseSlug = slugify(name) || 'ruleset';
  let candidate = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query('rulesets')
      .withIndex('by_slug', (q) => q.eq('slug', candidate))
      .unique();
    if (!existing || (rulesetId && existing._id === rulesetId)) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

export function missingSlug(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

export async function allocateNextFaqItemSlug(ctx: MutationCtx, rulesetId: Id<'rulesets'>): Promise<string> {
  const counterKey = `faq_item_slug:${rulesetId}`;
  let counter = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', counterKey))
    .unique();

  if (!counter) {
    const inserted = await ctx.db.insert('counters', {
      key: counterKey,
      value: 0,
    });
    counter = { _id: inserted, _creationTime: 0, key: counterKey, value: 0 };
  }

  let candidate = counter.value + 1;
  while (true) {
    const slug = String(candidate);
    const existing = await ctx.db
      .query('faq_items')
      .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', rulesetId).eq('slug', slug))
      .unique();
    if (!existing) {
      await ctx.db.patch(counter._id, { value: candidate });
      return slug;
    }
    candidate += 1;
  }
}

export type StoredTroopFace = { combat?: unknown; back?: StoredTroopFace };

export function hasLegacySupportNames(combat: unknown): boolean {
  return typeof combat === 'object' && combat !== null && ('fundedStrength' in combat || 'fundingCost' in combat);
}

export function troopHasLegacySupportNames(troop: unknown): boolean {
  const face = troop as StoredTroopFace | null;
  return hasLegacySupportNames(face?.combat) || hasLegacySupportNames(face?.back?.combat);
}

/* Only `combat` is rewritten, on the front and on an authored back; every other troop field stays as stored. */
export function troopWithSupportNames(troop: unknown): unknown {
  if (typeof troop !== 'object' || troop === null) {
    return troop;
  }
  const face = troop as StoredTroopFace;
  return {
    ...face,
    ...(face.combat !== undefined && { combat: withSupportNames(face.combat) }),
    ...(face.back && typeof face.back === 'object' && face.back.combat !== undefined
      ? { back: { ...face.back, combat: withSupportNames(face.back.combat) } }
      : {}),
  };
}
