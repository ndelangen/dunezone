import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { DEFAULT_FAQ_TAG } from '../src/shared/faq/tags';
import { normalizeFormattedText } from '../src/shared/formattedText';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalQuery, query } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { accountStateOf } from './lib/accountLifecycle';
import { hasAuthoredBack, TOKEN_ASSET_TYPES, tokenBackOf } from './lib/assetBacks';
import { DECAL_ID_RENAMES, DECAL_SCALE_FACTORS } from './lib/decalRetune';
import {
  reconcileAnswerActivity,
  reconcileFactionActivity,
  reconcileMembershipActivity,
  reconcileQuestionActivity,
} from './lib/profileActivity';
import { ensureProfileForUser, profileSourcesFromUserDoc } from './lib/profileBootstrap';
import { reconcileProfileDiscovery } from './lib/profileDiscovery';
import {
  reconcileAnswerStatistics,
  reconcileFactionStatistics,
  reconcileProfileStatistics,
  reconcileQuestionStatistics,
  reconcileRulesetStatistics,
} from './lib/statistics';
import { nowIso, slugify } from './lib/utils';
import schema from './schema';
import type { MutationCtx, QueryCtx } from './types';

type MigrationRef = FunctionReference<'mutation', 'internal'>;

const MIGRATION_IDS: Record<string, MigrationRef> = {
  groups_slug_v1: internal.migrations.groups_slug_v1,
  rulesets_slug_v1: internal.migrations.rulesets_slug_v1,
  rulesets_description_v1: internal.migrations.rulesets_description_v1,
  rulesets_about_v1: internal.migrations.rulesets_about_v1,
  rulesets_about_verify_v1: internal.migrations.rulesets_about_verify_v1,
  rulesets_description_retire_v1: internal.migrations.rulesets_description_retire_v1,
  rulesets_description_retire_verify_v1: internal.migrations.rulesets_description_retire_verify_v1,
  faq_item_slug_v1: internal.migrations.faq_item_slug_v1,
  faq_item_tags_v1: internal.migrations.faq_item_tags_v1,
  profiles_from_users_v1: internal.migrations.profiles_from_users_v1,
  faction_slug_reservations_v1: internal.migrations.faction_slug_reservations_v1,
  faction_slug_reservations_verify_v1: internal.migrations.faction_slug_reservations_verify_v1,
  rulesets_remove_homepage_counts_v1: internal.migrations.rulesets_remove_homepage_counts_v1,
  statistics_profiles_v1: internal.migrations.statistics_profiles_v1,
  statistics_factions_v1: internal.migrations.statistics_factions_v1,
  statistics_rulesets_v1: internal.migrations.statistics_rulesets_v1,
  statistics_questions_v1: internal.migrations.statistics_questions_v1,
  statistics_answers_v1: internal.migrations.statistics_answers_v1,
  profile_discovery_profiles_v1: internal.migrations.profile_discovery_profiles_v1,
  profile_activity_memberships_v1: internal.migrations.profile_activity_memberships_v1,
  profile_activity_factions_v1: internal.migrations.profile_activity_factions_v1,
  profile_activity_questions_v1: internal.migrations.profile_activity_questions_v1,
  profile_activity_answers_v1: internal.migrations.profile_activity_answers_v1,
  faction_decal_retune_v1: internal.migrations.faction_decal_retune_v1,
  groups_soft_delete_backfill_v1: internal.migrations.groups_soft_delete_backfill_v1,
  groups_soft_delete_verify_v1: internal.migrations.groups_soft_delete_verify_v1,
  faction_complexity_grouped_v1: internal.migrations.faction_complexity_grouped_v1,
  faction_complexity_grouped_verify_v1: internal.migrations.faction_complexity_grouped_verify_v1,
  faction_inline_formatted_text_v1: internal.migrations.faction_inline_formatted_text_v1,
  faction_inline_formatted_text_verify_v1: internal.migrations.faction_inline_formatted_text_verify_v1,
  assets_about_v1: internal.migrations.assets_about_v1,
  assets_about_verify_v1: internal.migrations.assets_about_verify_v1,
  account_lifecycle_profiles_v1: internal.migrations.account_lifecycle_profiles_v1,
  account_lifecycle_verify_v1: internal.migrations.account_lifecycle_verify_v1,
  assets_back_modes_v1: internal.migrations.assets_back_modes_v1,
  asset_relations_token_back_drop_v1: internal.migrations.asset_relations_token_back_drop_v1,
  assets_back_modes_verify_v1: internal.migrations.assets_back_modes_verify_v1,
  assets_deck_cardback_wrap_v1: internal.migrations.assets_deck_cardback_wrap_v1,
  assets_deck_cardback_wrap_verify_v1: internal.migrations.assets_deck_cardback_wrap_verify_v1,
};

type MigrationId = keyof typeof MIGRATION_IDS;

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'migrations:',
  schema,
});

async function resolveUniqueGroupSlug(ctx: QueryCtx | MutationCtx, name: string, groupId?: Id<'groups'>) {
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

async function resolveUniqueRulesetSlug(ctx: QueryCtx | MutationCtx, name: string, rulesetId?: Id<'rulesets'>) {
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

function migrationRefsFor(ids: string[]): MigrationRef[] {
  return ids.map((id) => {
    if (!(id in MIGRATION_IDS)) {
      throw new Error(`Unknown migration id: ${id}`);
    }
    return MIGRATION_IDS[id as MigrationId];
  });
}

function missingSlug(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

async function allocateNextFaqItemSlug(ctx: MutationCtx, rulesetId: Id<'rulesets'>): Promise<string> {
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

function toMigrationId(name: string): string {
  const parts = name.split(':');
  return parts[parts.length - 1] ?? name;
}

export const groups_slug_v1 = migrations.define({
  table: 'groups',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!missingSlug((row as { slug?: unknown }).slug)) {
      return;
    }
    const slug = await resolveUniqueGroupSlug(ctx, row.name, row._id);
    return { slug };
  },
});

export const rulesets_slug_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!missingSlug((row as { slug?: unknown }).slug)) {
      return;
    }
    const slug = await resolveUniqueRulesetSlug(ctx, row.name, row._id);
    return { slug };
  },
});

/** Retains the completed `description` backfill identity; the narrowed schema now enforces what it filled in. */
export const rulesets_description_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Retains the completed About backfill identity; the required field now enforces what it filled in. */
export const rulesets_about_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Retains the completed About verification identity; the required field now enforces its invariant. */
export const rulesets_about_verify_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Retains the completed Ruleset prose retirement identity through the schema-narrowing release. */
export const rulesets_description_retire_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Retains the completed retirement verification identity; the narrowed schema now enforces it. */
export const rulesets_description_retire_verify_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async () => undefined,
});

export const faq_item_slug_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!missingSlug((row as { slug?: unknown }).slug)) {
      return;
    }
    const slug = await allocateNextFaqItemSlug(ctx, row.ruleset_id);
    return { slug };
  },
});

export const faq_item_tags_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const tags = (row as { tags?: unknown }).tags;
    if (Array.isArray(tags) && tags.length > 0) {
      return;
    }
    return { tags: [DEFAULT_FAQ_TAG] };
  },
});

/** Ensures each auth `users` row has a `profiles` row (idempotent; skips when profile exists). */
export const profiles_from_users_v1 = migrations.define({
  table: 'users',
  batchSize: 50,
  migrateOne: async (ctx, user) => {
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', user._id))
      .unique();
    if (existing) {
      return;
    }
    await ensureProfileForUser(ctx, user._id, profileSourcesFromUserDoc(user));
  },
});

async function archivedFactionSlug(ctx: MutationCtx, slug: string, factionId: Id<'factions'>) {
  const base = `${slug}-archived-${factionId}`;
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', candidate))
      .unique();
    if (!existing || existing._id === factionId) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

/**
 * Repairs historical slug reuse while preserving the active faction's public URL.
 * Future writes reserve slugs globally, including those on soft-deleted rows.
 */
export const faction_slug_reservations_v1 = migrations.define({
  table: 'factions',
  batchSize: 25,
  migrateOne: async (ctx, faction) => {
    const matches = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', faction.slug))
      .take(2);
    if (matches.length <= 1) {
      return;
    }

    const active = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', faction.slug))
      .filter((q) => q.eq(q.field('is_deleted'), false))
      .take(2);
    if (active.length > 1) {
      throw new Error(`Cannot repair slug ${faction.slug}: multiple active factions`);
    }

    const keeper = active[0] ?? matches[0];
    if (keeper?._id === faction._id) {
      return;
    }

    return { slug: await archivedFactionSlug(ctx, faction.slug, faction._id) };
  },
});

/** Successful completion proves faction slugs are globally unique. */
export const faction_slug_reservations_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 25,
  migrateOne: async (ctx, faction) => {
    const matches = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', faction.slug))
      .take(2);
    if (matches.length > 1) {
      throw new Error(`Duplicate faction slug remains: ${faction.slug}`);
    }
  },
});

/** Retains the completed cleanup migration identity through the schema-narrowing release. */
export const rulesets_remove_homepage_counts_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Populates reusable Profile discovery while live profile writes maintain it automatically. */
export const profile_discovery_profiles_v1 = migrations.define({
  table: 'profiles',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileProfileDiscovery(ctx, row);
  },
});

/** Populates Statistics from canonical profiles while live writes keep it current. */
export const statistics_profiles_v1 = migrations.define({
  table: 'profiles',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileProfileStatistics(ctx, row);
  },
});

/** Populates Statistics from canonical factions, excluding soft-deleted rows. */
export const statistics_factions_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileFactionStatistics(ctx, row);
  },
});

/** Populates Statistics from canonical rulesets, excluding soft-deleted rows. */
export const statistics_rulesets_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileRulesetStatistics(ctx, row);
  },
});

/** Populates global and per-ruleset Statistics from canonical questions. */
export const statistics_questions_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileQuestionStatistics(ctx, row);
  },
});

/** Populates global and per-ruleset Statistics from canonical answers. */
export const statistics_answers_v1 = migrations.define({
  table: 'faq_answers',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileAnswerStatistics(ctx, row);
  },
});

/** Populates per-user activity counts from active memberships; live writes maintain them. */
export const profile_activity_memberships_v1 = migrations.define({
  table: 'group_members',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileMembershipActivity(ctx, row);
  },
});

/** Populates per-user activity counts from non-deleted factions. */
export const profile_activity_factions_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileFactionActivity(ctx, row);
  },
});

/** Populates per-user activity counts from questions asked. */
export const profile_activity_questions_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileQuestionActivity(ctx, row);
  },
});

/** Populates per-user activity counts from answers given. */
export const profile_activity_answers_v1 = migrations.define({
  table: 'faq_answers',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileAnswerActivity(ctx, row);
  },
});

/**
 * Vector-train retune (wayfinder #307): the train normalized decals into the shared square and 16 baked-paint decals gained `-multicolor` names.
 * Stored placements (faction.data.decals) get the matching rename + scale multiplier so cards render pixel-identically.
 * Run-once semantics come from the migrations framework;
 * factors live frozen in `./lib/decalRetune`.
 */
export const faction_decal_retune_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = (row as { data?: { decals?: unknown } }).data;
    if (!data || !Array.isArray(data.decals) || data.decals.length === 0) {
      return;
    }
    let changed = false;
    const decals = data.decals.map((decal) => {
      if (typeof decal !== 'object' || decal === null) {
        return decal;
      }
      const entry = decal as { id?: unknown; scale?: unknown };
      if (typeof entry.id !== 'string') {
        return decal;
      }
      const id = DECAL_ID_RENAMES[entry.id] ?? entry.id;
      const factor = DECAL_SCALE_FACTORS[id] ?? 1;
      const scale =
        typeof entry.scale === 'number' && factor !== 1
          ? Math.round(entry.scale * factor * 10_000) / 10_000
          : entry.scale;
      if (id !== entry.id || scale !== entry.scale) {
        changed = true;
        // Convex rejects `undefined` values, so never introduce an own `scale: undefined` key.
        return scale === undefined ? { ...entry, id } : { ...entry, id, scale };
      }
      return decal;
    });
    if (!changed) {
      return;
    }
    return { data: { ...data, decals } };
  },
});

/** Retains the completed grouped-complexity backfill identity after contract narrowing. */
export const faction_complexity_grouped_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Retains the completed grouped-complexity verification identity after contract narrowing. */
export const faction_complexity_grouped_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async () => undefined,
});

function normalizedMarksOnlyValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} is not a string`);
  }
  const current = normalizeFormattedText(value, 'marks-only');
  if (current.ok) {
    return current.value;
  }
  const joined = value.replace(/[ \t]*\r?\n[ \t]*/gu, ' ');
  const normalized = normalizeFormattedText(joined, 'marks-only');
  if (!normalized.ok) {
    throw new Error(`${field} cannot be normalized as marks-only formatted text`);
  }
  return normalized.value;
}

/** Joins legacy layout line breaks in faction setup and revival before those fields become marks-only. */
export const faction_inline_formatted_text_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = row.data as {
      rules?: { startText?: unknown; revivalText?: unknown };
    } | null;
    if (!data?.rules) {
      throw new Error(`Faction ${row._id} has no rules`);
    }
    const startText = normalizedMarksOnlyValue(data.rules.startText, `Faction ${row._id} setup`);
    const revivalText = normalizedMarksOnlyValue(data.rules.revivalText, `Faction ${row._id} revival`);
    if (startText === data.rules.startText && revivalText === data.rules.revivalText) {
      return;
    }
    return {
      data: { ...data, rules: { ...data.rules, startText, revivalText } },
    };
  },
});

/** Proves every stored faction setup and revival value fits the marks-only profile. */
export const faction_inline_formatted_text_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = row.data as {
      rules?: { startText?: unknown; revivalText?: unknown };
    } | null;
    if (!data?.rules) {
      throw new Error(`Faction ${row._id} has no rules`);
    }
    for (const [field, value] of [
      ['setup', data.rules.startText],
      ['revival', data.rules.revivalText],
    ] as const) {
      if (typeof value !== 'string' || !normalizeFormattedText(value, 'marks-only').ok) {
        throw new Error(`Faction ${row._id} ${field} is not marks-only formatted text`);
      }
    }
  },
});

/** Retains the completed Group lifecycle backfill identity through the schema-narrowing release. */
export const groups_soft_delete_backfill_v1 = migrations.define({
  table: 'groups',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/** Retains the completed lifecycle verification identity; the narrowed schema now enforces it. */
export const groups_soft_delete_verify_v1 = migrations.define({
  table: 'groups',
  batchSize: 50,
  migrateOne: async () => undefined,
});

/**
 * Puts the About key on every Asset that predates it (wayfinder #521).
 *
 * `assets.data` is `v.any()`, so no Convex validator gates this and `migrations:narrow-check` cannot see it: this migration is the only thing that makes the key true, and `assets_about_verify_v1` is the only thing that proves it.
 * Narrowing ahead of both is a silent break, because every strict read of a row without the key fails: `AssetFace` falls back to a neutral face across the landing, browse and picker surfaces, the edit organs route to the schema-drift dead end, and `readJobForRender` throws on a stale publication job.
 *
 * Empty, never generated prose.
 * An asset with nothing to explain is the normal case.
 */
export const assets_about_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = (row as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return;
    }
    const record = data as Record<string, unknown>;
    if (typeof record.about === 'string') {
      return;
    }
    return { data: { ...record, about: '' } };
  },
});

/**
 * Proves the backfill left nothing behind, which is what makes narrowing the Zod schemas safe.
 * A row whose `data` is not a plain object is outside both halves of the pair: the backfill skips it rather than fabricating content, so the proof tolerates it for the same reason, or one hand-written row would deadlock the pair with the widen offering no remediation.
 * Such a row is the schema-drift dead end already, and every strict read treats it as one;
 * About is not what is wrong with it.
 */
export const assets_about_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = (row as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return;
    }
    const about = (data as Record<string, unknown>).about;
    if (typeof about !== 'string') {
      throw new Error(`Asset ${row._id} still has no About`);
    }
  },
});

/** Backfills the compatible account lifecycle projection and mirrors it to existing auth users. */
export const account_lifecycle_profiles_v1 = migrations.define({
  table: 'profiles',
  batchSize: 50,
  migrateOne: async (ctx, profile) => {
    const user = await ctx.db.get('users', profile.user_id);
    if (!user) {
      throw new Error(`Profile ${profile._id} references missing user ${profile.user_id}`);
    }
    const profileState = profile.account_state;
    const userState = user.account_state;
    if (profileState && userState && profileState !== userState) {
      throw new Error(`Lifecycle mismatch for profile ${profile._id} and user ${user._id}`);
    }
    const accountState = profileState ?? userState ?? 'active';
    if (!userState) {
      await ctx.db.patch(user._id, { account_state: accountState });
    }
    return profileState ? undefined : { account_state: accountState };
  },
});

/** Proves every auth user has one lifecycle-consistent profile before narrowing. */
export const account_lifecycle_verify_v1 = migrations.define({
  table: 'users',
  batchSize: 50,
  migrateOne: async (ctx, user) => {
    const profiles = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', user._id))
      .take(2);
    if (profiles.length !== 1) {
      throw new Error(`User ${user._id} has ${profiles.length} profiles; expected exactly one`);
    }
    const profile = profiles[0];
    if (!profile?.account_state) {
      throw new Error(`Profile ${profile?._id ?? 'unknown'} has no account lifecycle state`);
    }
    if (profile.account_state !== accountStateOf(user)) {
      throw new Error(`Lifecycle mismatch for profile ${profile._id} and user ${user._id}`);
    }
  },
});

/**
 * Moves every token's back reference into its data («The stored shape of three back modes»).
 *
 * A reference whose relation row names a target the new rules honor gains that target's id in `data.back`;
 * a reference the rules cannot honor (missing row, deleted target, wrong type, or a target whose own back is not authored) rewrites to `same`, the migration policy Norbert set for both invalid classes.
 * Custom rows pass untouched, so only reference rows are rewritten.
 */
export const assets_back_modes_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!TOKEN_ASSET_TYPES.has(row.type)) {
      return;
    }
    const back = tokenBackOf(row.data);
    if (back?.mode !== 'reference' || typeof back.asset_id === 'string') {
      return;
    }
    const relation = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', row._id).eq('kind', 'token-back'))
      .first();
    const target = relation ? await ctx.db.get('assets', relation.to_asset_id) : null;
    const honored = target !== null && !target.is_deleted && target.type === row.type && hasAuthoredBack(target);
    const data = row.data as Record<string, unknown>;
    return {
      data: {
        ...data,
        back: honored ? { mode: 'reference', asset_id: relation!.to_asset_id } : { mode: 'same' },
      },
    };
  },
});

/** Drops the `token-back` relation rows whose targets `assets_back_modes_v1` moved into the data. */
export const asset_relations_token_back_drop_v1 = migrations.define({
  table: 'asset_relations',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (row.kind !== 'token-back') {
      return;
    }
    await ctx.db.delete(row._id);
  },
});

/**
 * Proves the move left nothing behind: every token back is one of the three modes, every reference carries its target in data, and no `token-back` relation row remains.
 * Passing is what makes requiring `asset_id` on the reference member safe in a later release.
 */
export const assets_back_modes_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!TOKEN_ASSET_TYPES.has(row.type)) {
      return;
    }
    const back = tokenBackOf(row.data);
    if (back?.mode !== 'custom' && back?.mode !== 'same' && back?.mode !== 'reference') {
      throw new Error(`Token ${row._id} has no recognisable back mode`);
    }
    if (back.mode === 'reference' && typeof back.asset_id !== 'string') {
      throw new Error(`Token ${row._id} still references through a relation row`);
    }
    const relation = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', row._id).eq('kind', 'token-back'))
      .first();
    if (relation) {
      throw new Error(`Token ${row._id} still has a token-back relation row`);
    }
  },
});

/**
 * Wraps every bare deck cardback into the tagged custom member («The stored shape of three back modes», the wrap deferred out of slice 1).
 * Reference cardbacks and already-wrapped rows pass untouched, so the rewrite reaches exactly the pre-wrap authored rows.
 */
export const assets_deck_cardback_wrap_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    if (row.type !== 'deck') {
      return;
    }
    const data = row.data as { cardback?: Record<string, unknown> } | null;
    const cardback = data?.cardback;
    if (typeof cardback !== 'object' || cardback === null || 'mode' in cardback) {
      return;
    }
    return { data: { ...data, cardback: { mode: 'custom', ...cardback } } };
  },
});

/** Proves every deck cardback wears a mode, which is what makes removing the bare transitional member safe later. */
export const assets_deck_cardback_wrap_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    if (row.type !== 'deck') {
      return;
    }
    const cardback = (row.data as { cardback?: { mode?: unknown } } | null)?.cardback;
    if (cardback?.mode !== 'custom' && cardback?.mode !== 'reference') {
      throw new Error(`Deck ${row._id} still has an untagged cardback`);
    }
  },
});

const AUDIT_SCAN_LIMIT = 4096;
const AUDIT_ID_SAMPLE_LIMIT = 50;

/**
 * Read-only evidence for the historical hard-delete audit (wayfinder #191, ADR-0003): counts group references that no longer resolve to a Group row.
 * Repairs nothing: dangling references stay in place and the read layer projects them to null.
 */
export const groupsLifecycleAudit = internalQuery({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query('groups').take(AUDIT_SCAN_LIMIT);

    const factions = await ctx.db.query('factions').take(AUDIT_SCAN_LIMIT);
    const rulesets = await ctx.db.query('rulesets').take(AUDIT_SCAN_LIMIT);
    const memberships = await ctx.db.query('group_members').take(AUDIT_SCAN_LIMIT);

    /**
     * Every distinct referenced Group is resolved by primary key, so a reference is judged against the actual row, never against a truncated Group scan window.
     */
    const referencedIds = new Set<Id<'groups'>>();
    for (const row of [...factions, ...rulesets, ...memberships]) {
      if (row.group_id !== null) {
        referencedIds.add(row.group_id);
      }
    }
    const resolvesToRow = new Map<Id<'groups'>, boolean>();
    for (const groupId of referencedIds) {
      resolvesToRow.set(groupId, (await ctx.db.get('groups', groupId)) !== null);
    }

    function danglingReport(rows: { _id: string; group_id: Id<'groups'> | null }[]) {
      const dangling = rows.filter((row) => row.group_id !== null && resolvesToRow.get(row.group_id) === false);
      return {
        scanned: rows.length,
        truncated: rows.length === AUDIT_SCAN_LIMIT,
        withGroupReference: rows.filter((row) => row.group_id !== null).length,
        dangling: dangling.length,
        danglingIds: dangling.slice(0, AUDIT_ID_SAMPLE_LIMIT).map((row) => row._id),
      };
    }

    return {
      groups: {
        total: groups.length,
        truncated: groups.length === AUDIT_SCAN_LIMIT,
        deleted: groups.filter((group) => group.is_deleted).length,
      },
      factions: danglingReport(factions),
      rulesets: danglingReport(rulesets),
      memberships: danglingReport(memberships),
    };
  },
});

/** Proves the account lifecycle picker and direct-ownership indexes are queryable after activation. */
export const accountLifecycleIndexAudit = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [activeProfiles, groups, factions, rulesets] = await Promise.all([
      ctx.db
        .query('profiles')
        .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
        .take(1),
      ctx.db.query('groups').withIndex('by_created_by_deleted').take(1),
      ctx.db.query('factions').withIndex('by_owner_deleted').take(1),
      ctx.db.query('rulesets').withIndex('by_owner_deleted').take(1),
    ]);
    return {
      ok: true,
      sampled: {
        activeProfiles: activeProfiles.length,
        groups: groups.length,
        factions: factions.length,
        rulesets: rulesets.length,
      },
    };
  },
});

export const run = migrations.runner();

export const runDeployMigrations = migrations.runner([
  internal.migrations.groups_slug_v1,
  internal.migrations.rulesets_slug_v1,
  internal.migrations.faq_item_slug_v1,
  internal.migrations.faq_item_tags_v1,
  internal.migrations.profiles_from_users_v1,
  internal.migrations.faction_slug_reservations_v1,
  internal.migrations.faction_slug_reservations_verify_v1,
  internal.migrations.rulesets_remove_homepage_counts_v1,
  internal.migrations.statistics_profiles_v1,
  internal.migrations.statistics_factions_v1,
  internal.migrations.statistics_rulesets_v1,
  internal.migrations.statistics_questions_v1,
  internal.migrations.statistics_answers_v1,
  internal.migrations.profile_discovery_profiles_v1,
  internal.migrations.faction_decal_retune_v1,
  internal.migrations.groups_soft_delete_backfill_v1,
  internal.migrations.groups_soft_delete_verify_v1,
  internal.migrations.account_lifecycle_profiles_v1,
  internal.migrations.account_lifecycle_verify_v1,
]);

export const runRequired = mutation({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const refs = migrationRefsFor(args.ids);
    const state = await migrations.runSerially(ctx, refs);
    return { started: true, state };
  },
});

export const getStatus = query({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const refs = args.ids ? migrationRefsFor(args.ids) : undefined;
    return await migrations.getStatus(ctx, { migrations: refs, limit: 100 });
  },
});

export const listRunSnapshots = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('migration_runs').order('desc').take(100);
  },
});

/** Single subscription for admin UI: live statuses + recorded snapshots. */
export const adminDashboard = query({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const refs = args.ids ? migrationRefsFor(args.ids) : undefined;
    const statuses = await migrations.getStatus(ctx, {
      migrations: refs,
      limit: 100,
    });
    const snapshots = await ctx.db.query('migration_runs').order('desc').take(100);
    return { statuses, snapshots };
  },
});

export const syncMigrationRuns = mutation({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const refs = args.ids ? migrationRefsFor(args.ids) : undefined;
    const statuses = await migrations.getStatus(ctx, {
      migrations: refs,
      limit: 100,
    });
    const updatedAt = nowIso();
    for (const status of statuses) {
      const migrationId = toMigrationId(status.name);
      const existing = await ctx.db
        .query('migration_runs')
        .withIndex('by_migration_id', (q) => q.eq('migration_id', migrationId))
        .unique();
      const patch = {
        migration_id: migrationId,
        state: status.state,
        is_done: status.isDone,
        processed: status.processed,
        latest_start: status.latestStart,
        latest_end: status.latestEnd,
        error: status.error,
        updated_at: updatedAt,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert('migration_runs', patch);
      }
    }
    return { synced: statuses.length };
  },
});

export const verifyMigration = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const refs = migrationRefsFor([args.id]);
    const [status] = await migrations.getStatus(ctx, { migrations: refs });
    if (!status) {
      return {
        id: args.id,
        pending: 1,
        complete: false,
        state: 'unknown',
      };
    }
    const complete = status.isDone && status.state === 'success';
    return {
      id: args.id,
      pending: complete ? 0 : 1,
      complete,
      state: status.state,
      processed: status.processed,
      latestEnd: status.latestEnd ?? null,
      error: status.error ?? null,
    };
  },
});

export const assertReadyForNarrow = query({
  args: { required: v.array(v.string()) },
  handler: async (ctx, args) => {
    const refs = migrationRefsFor(args.required);
    const statuses = await migrations.getStatus(ctx, { migrations: refs });
    const byId = new Map(statuses.map((status) => [toMigrationId(status.name), status]));
    const missing = args.required.filter((id) => !byId.has(id));
    const incomplete = args.required
      .map((id) => byId.get(id))
      .filter((status): status is NonNullable<typeof status> => status != null)
      .filter((status) => !(status.isDone && status.state === 'success'));
    if (incomplete.length > 0 || missing.length > 0) {
      const detail = [
        ...incomplete.map((status) => `${status.name}(${status.state}, isDone=${status.isDone})`),
        ...missing.map((id) => `${id}(missing)`),
      ].join(', ');
      throw new Error(`Narrow blocked: required migrations are incomplete. ${detail}`);
    }
    return {
      ok: true,
      required: args.required,
      statuses: args.required.map((id) => {
        const status = byId.get(id);
        return {
          id,
          name: status?.name ?? null,
          state: status?.state ?? 'unknown',
          isDone: status?.isDone ?? false,
          processed: status?.processed ?? 0,
        };
      }),
    };
  },
});
