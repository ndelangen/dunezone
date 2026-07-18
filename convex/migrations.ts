import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { DEFAULT_FAQ_TAG } from '../src/app/faq/tags';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import {
  assertExactlyOneFactionSheetTarget,
  ensureFactionSheetConfig,
  ensureFactionSheetTargetForBackfill,
  FACTION_SHEET_ASSET_TYPE,
  parseFactionInput,
} from './lib/factionSheetTargets';
import { ensureProfileForUser, profileSourcesFromUserDoc } from './lib/profileBootstrap';
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
  faction_sheet_targets_backfill_v1: internal.migrations.faction_sheet_targets_backfill_v1,
  faction_sheet_targets_verify_v1: internal.migrations.faction_sheet_targets_verify_v1,
};

type MigrationId = keyof typeof MIGRATION_IDS;

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'migrations:',
  schema,
});

const FACTION_SHEET_TARGET_MIGRATION_IDS = [
  'faction_sheet_targets_backfill_v1',
  'faction_sheet_targets_verify_v1',
] as const;

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
    if (!existing || (groupId && existing._id === groupId)) return candidate;
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
    if (!existing || (rulesetId && existing._id === rulesetId)) return candidate;
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
    if (!missingSlug((row as { slug?: unknown }).slug)) return;
    const slug = await resolveUniqueGroupSlug(ctx, row.name, row._id);
    return { slug };
  },
});

export const rulesets_slug_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!missingSlug((row as { slug?: unknown }).slug)) return;
    const slug = await resolveUniqueRulesetSlug(ctx, row.name, row._id);
    return { slug };
  },
});

export const faq_item_slug_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (!missingSlug((row as { slug?: unknown }).slug)) return;
    const slug = await allocateNextFaqItemSlug(ctx, row.ruleset_id);
    return { slug };
  },
});

export const faq_item_tags_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const tags = (row as { tags?: unknown }).tags;
    if (Array.isArray(tags) && tags.length > 0) return;
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
    if (existing) return;
    await ensureProfileForUser(ctx, user._id, profileSourcesFromUserDoc(user));
  },
});

/** Bounded, resumable, idempotent target creation for active factions only. */
export const faction_sheet_targets_backfill_v1 = migrations.define({
  table: 'factions',
  customRange: (q) => q.withIndex('by_deleted', (index) => index.eq('is_deleted', false)),
  batchSize: 25,
  migrateOne: async (ctx, faction) => {
    parseFactionInput(faction.data);
    await ensureFactionSheetTargetForBackfill(ctx, faction._id);
  },
});

/**
 * A separate bounded pass makes successful migration status proof that every
 * active faction had exactly one target after backfill completion.
 */
export const faction_sheet_targets_verify_v1 = migrations.define({
  table: 'factions',
  customRange: (q) => q.withIndex('by_deleted', (index) => index.eq('is_deleted', false)),
  batchSize: 25,
  migrateOne: async (ctx, faction) => {
    parseFactionInput(faction.data);
    await assertExactlyOneFactionSheetTarget(ctx, faction._id);
  },
});

export const run = migrations.runner();

export const runDeployMigrations = migrations.runner([
  internal.migrations.groups_slug_v1,
  internal.migrations.rulesets_slug_v1,
  internal.migrations.faq_item_slug_v1,
  internal.migrations.faq_item_tags_v1,
  internal.migrations.profiles_from_users_v1,
  internal.migrations.faction_sheet_targets_backfill_v1,
  internal.migrations.faction_sheet_targets_verify_v1,
]);

export const runRequired = mutation({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const refs = migrationRefsFor(args.ids);
    const requestedFactionSheetIds = args.ids.filter((id) =>
      FACTION_SHEET_TARGET_MIGRATION_IDS.includes(
        id as (typeof FACTION_SHEET_TARGET_MIGRATION_IDS)[number]
      )
    );
    if (requestedFactionSheetIds.length > 0) {
      const statuses = await migrations.getStatus(ctx, {
        migrations: migrationRefsFor(requestedFactionSheetIds),
      });
      const completed = new Set(
        statuses
          .filter((status) => status.isDone && status.state === 'success')
          .map((status) => toMigrationId(status.name))
      );
      if (requestedFactionSheetIds.some((id) => !completed.has(id))) {
        const config = await ensureFactionSheetConfig(ctx);
        if (config.status === 'active') {
          throw new Error(
            `Faction-sheet migration requires paused or disabled configuration; found ${config.status}`
          );
        }
      }
    }
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
      ...(args.id === 'faction_sheet_targets_verify_v1'
        ? {
            missing: complete ? 0 : null,
            duplicates: complete ? 0 : null,
          }
        : {}),
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
    if (args.required.includes('faction_sheet_targets_verify_v1')) {
      const configs = await ctx.db
        .query('asset_type_configs')
        .withIndex('by_asset_type', (q) => q.eq('asset_type', FACTION_SHEET_ASSET_TYPE))
        .take(2);
      if (configs.length !== 1) {
        throw new Error(
          `Narrow blocked: expected exactly one faction-sheet config, found ${configs.length}`
        );
      }
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
