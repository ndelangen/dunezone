import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { DEFAULT_FAQ_TAG } from '../src/app/faq/tags';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { setHomepageCommunityPresence, setHomepageRulesetFaqTotals } from './lib/homepageCommunity';
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
  faq_item_slug_v1: internal.migrations.faq_item_slug_v1,
  faq_item_tags_v1: internal.migrations.faq_item_tags_v1,
  profiles_from_users_v1: internal.migrations.profiles_from_users_v1,
  faction_slug_reservations_v1: internal.migrations.faction_slug_reservations_v1,
  faction_slug_reservations_verify_v1: internal.migrations.faction_slug_reservations_verify_v1,
  homepage_factions_v1: internal.migrations.homepage_factions_v1,
  homepage_rulesets_v1: internal.migrations.homepage_rulesets_v1,
  homepage_members_v1: internal.migrations.homepage_members_v1,
  statistics_profiles_v1: internal.migrations.statistics_profiles_v1,
  statistics_factions_v1: internal.migrations.statistics_factions_v1,
  statistics_rulesets_v1: internal.migrations.statistics_rulesets_v1,
  statistics_questions_v1: internal.migrations.statistics_questions_v1,
  statistics_answers_v1: internal.migrations.statistics_answers_v1,
  profile_discovery_profiles_v1: internal.migrations.profile_discovery_profiles_v1,
};

type MigrationId = keyof typeof MIGRATION_IDS;

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'migrations:',
  schema,
});

async function resolveUniqueGroupSlug(
  ctx: QueryCtx | MutationCtx,
  name: string,
  groupId?: Id<'groups'>
) {
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

async function resolveUniqueRulesetSlug(
  ctx: QueryCtx | MutationCtx,
  name: string,
  rulesetId?: Id<'rulesets'>
) {
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

async function allocateNextFaqItemSlug(
  ctx: MutationCtx,
  rulesetId: Id<'rulesets'>
): Promise<string> {
  const counterKey = `faq_item_slug:${rulesetId}`;
  let counter = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', counterKey))
    .unique();

  if (!counter) {
    const inserted = await ctx.db.insert('counters', { key: counterKey, value: 0 });
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
 * Repairs historical slug reuse while preserving the active faction's public URL. Future writes
 * reserve slugs globally, including those on soft-deleted rows.
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

export const homepage_factions_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await setHomepageCommunityPresence(ctx, 'factions', row._id, !row.is_deleted);
  },
});

export const homepage_rulesets_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await setHomepageCommunityPresence(ctx, 'rulesets', row._id, !row.is_deleted);
    const questions = await ctx.db
      .query('faq_items')
      .withIndex('by_ruleset_created', (q) => q.eq('ruleset_id', row._id))
      .collect();
    const answers = (
      await Promise.all(
        questions.map((question) =>
          ctx.db
            .query('faq_answers')
            .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
            .collect()
        )
      )
    ).reduce((total, rows) => total + rows.length, 0);
    await ctx.db.patch(row._id, {
      homepage_question_count: questions.length,
      homepage_answer_count: answers,
    });
    await setHomepageRulesetFaqTotals(ctx, row._id, !row.is_deleted, questions.length, answers);
  },
});

export const homepage_members_v1 = migrations.define({
  table: 'profiles',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await setHomepageCommunityPresence(ctx, 'members', row._id, true);
  },
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

export const run = migrations.runner();

export const runDeployMigrations = migrations.runner([
  internal.migrations.groups_slug_v1,
  internal.migrations.rulesets_slug_v1,
  internal.migrations.faq_item_slug_v1,
  internal.migrations.faq_item_tags_v1,
  internal.migrations.profiles_from_users_v1,
  internal.migrations.faction_slug_reservations_v1,
  internal.migrations.faction_slug_reservations_verify_v1,
  internal.migrations.homepage_factions_v1,
  internal.migrations.homepage_rulesets_v1,
  internal.migrations.homepage_members_v1,
  internal.migrations.statistics_profiles_v1,
  internal.migrations.statistics_factions_v1,
  internal.migrations.statistics_rulesets_v1,
  internal.migrations.statistics_questions_v1,
  internal.migrations.statistics_answers_v1,
  internal.migrations.profile_discovery_profiles_v1,
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
    const statuses = await migrations.getStatus(ctx, { migrations: refs, limit: 100 });
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
    const statuses = await migrations.getStatus(ctx, { migrations: refs, limit: 100 });
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
