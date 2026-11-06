import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { ARRAKIS_MIGRATION_IDS } from './arrakisMigrations';
import { CATALOGUE_MIGRATION_IDS } from './catalogueMigrations';
import { EMBLEM_MIGRATION_IDS } from './emblemMigrations';
import { adminQuery, internalMutation, mutation } from './functions';
import { syncBoardReadiness } from './lib/boardReadiness';
import { assertCatalogueSourceExact, isCatalogueKindName, repairCatalogueEntry } from './lib/catalogueEntries';
import { syncFactionCard } from './lib/factionCards';
import { requireAdminUserId } from './lib/policy';
import {
  reconcileAnswerActivity,
  reconcileFactionActivity,
  reconcileMembershipActivity,
  reconcileQuestionActivity,
} from './lib/profileActivity';
import { ensureProfileForUser, profileSourcesFromUserDoc } from './lib/profileBootstrap';
import { reconcileProfileDiscovery } from './lib/profileDiscovery';
import { ensureRulebookEditionArtifacts } from './lib/rulebookEditionArtifacts';
import {
  contentsForRulebookEdition,
  rulebookDraftContentsHash,
  rulebookEditionContentsHash,
} from './lib/rulebookEditionContents';
import {
  reconcileAnswerStatistics,
  reconcileAssetStatistics,
  reconcileFactionStatistics,
  reconcileGroupStatistics,
  reconcileProfileStatistics,
  reconcileQuestionStatistics,
  reconcileRulesetStatistics,
} from './lib/statistics';
import { nowIso } from './lib/utils';
import { PUBLICATION_MIGRATION_IDS } from './publicationMigrations';
import schema from './schema';
import type { MutationCtx } from './types';

type MigrationRef = FunctionReference<'mutation', 'internal'>;

const MIGRATION_IDS: Record<string, MigrationRef> = {
  board_readiness_v1: internal.migrations.board_readiness_v1,
  catalogue_entries_factions_v1: internal.migrations.catalogue_entries_factions_v1,
  catalogue_entries_assets_v1: internal.migrations.catalogue_entries_assets_v1,
  catalogue_entries_assets_verify_v1: internal.migrations.catalogue_entries_assets_verify_v1,
  catalogue_entries_profiles_v1: internal.migrations.catalogue_entries_profiles_v1,
  catalogue_entries_profiles_verify_v1: internal.migrations.catalogue_entries_profiles_verify_v1,
  catalogue_entries_faq_v1: internal.migrations.catalogue_entries_faq_v1,
  catalogue_entries_faq_verify_v1: internal.migrations.catalogue_entries_faq_verify_v1,
  ...CATALOGUE_MIGRATION_IDS,
  ...PUBLICATION_MIGRATION_IDS,
  ...EMBLEM_MIGRATION_IDS,
  ...ARRAKIS_MIGRATION_IDS,
  catalogue_entries_prune_v1: internal.migrations.catalogue_entries_prune_v1,
  catalogue_entries_verify_v1: internal.migrations.catalogue_entries_verify_v1,
  catalogue_entries_verify_v2: internal.migrations.catalogue_entries_verify_v2,
  profiles_from_users_v1: internal.migrations.profiles_from_users_v1,
  statistics_profiles_v1: internal.migrations.statistics_profiles_v1,
  statistics_factions_v1: internal.migrations.statistics_factions_v1,
  statistics_rulesets_v1: internal.migrations.statistics_rulesets_v1,
  statistics_questions_v1: internal.migrations.statistics_questions_v1,
  statistics_answers_v1: internal.migrations.statistics_answers_v1,
  statistics_groups_v1: internal.migrations.statistics_groups_v1,
  statistics_assets_v1: internal.migrations.statistics_assets_v1,
  profile_discovery_profiles_v1: internal.migrations.profile_discovery_profiles_v1,
  profile_activity_memberships_v1: internal.migrations.profile_activity_memberships_v1,
  profile_activity_factions_v1: internal.migrations.profile_activity_factions_v1,
  profile_activity_questions_v1: internal.migrations.profile_activity_questions_v1,
  profile_activity_answers_v1: internal.migrations.profile_activity_answers_v1,
  rulebook_edition_artifacts_v1: internal.migrations.rulebook_edition_artifacts_v1,
  rulebook_contents_hash_drafts_v1: internal.migrations.rulebook_contents_hash_drafts_v1,
  rulebook_contents_hash_editions_v1: internal.migrations.rulebook_contents_hash_editions_v1,
  board_readiness_listing_v1: internal.migrations.board_readiness_listing_v1,
  faction_cards_v1: internal.migrations.faction_cards_v1,
};

type MigrationId = keyof typeof MIGRATION_IDS;

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'migrations:',
  schema,
});

function migrationRefsFor(ids: string[]): MigrationRef[] {
  return ids.map((id) => {
    if (!(id in MIGRATION_IDS)) {
      throw new Error(`Unknown migration id: ${id}`);
    }
    return MIGRATION_IDS[id as MigrationId];
  });
}

/* Without ids, every listed migration: the component still holds states for ids pruned from the manifest, which are history only. */
function listedRefs(ids: string[] | undefined): MigrationRef[] {
  return migrationRefsFor(ids ?? Object.keys(MIGRATION_IDS));
}

function toMigrationId(name: string): string {
  const parts = name.split(':');
  return parts[parts.length - 1] ?? name;
}

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

/** Populates Statistics from canonical groups, excluding soft-deleted rows. */
export const statistics_groups_v1 = migrations.define({
  table: 'groups',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await reconcileGroupStatistics(ctx, row);
  },
});

/** Populates per-type asset Statistics, excluding soft-deleted rows; small batches because boards carry their geometry. */
export const statistics_assets_v1 = migrations.define({
  table: 'assets',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    await reconcileAssetStatistics(ctx, row);
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

/** Reserves permanent HTML and PDF identities for every Edition that predates publication workflows. */
export const rulebook_edition_artifacts_v1 = migrations.define({
  table: 'rulebook_editions',
  batchSize: 50,
  migrateOne: async (ctx, edition) => {
    await ensureRulebookEditionArtifacts(ctx, edition);
  },
});

type ContentsHashTable = 'rulebook_drafts' | 'rulebook_editions';

/**
 * Defines one backfill that writes `contents_hash` on each row of a table from its stored Contents.
 * Replaying it recomputes the same hash and writes nothing.
 * Contents that no longer parse leave no hash, so the row stays on the full comparison.
 */
function contentsHashBackfill(
  table: ContentsHashTable,
  hashFor: (ctx: MutationCtx, row: Doc<ContentsHashTable>) => Promise<string | undefined>
) {
  return migrations.define({
    table,
    batchSize: 2,
    migrateOne: async (ctx, row) => {
      const contentsHash = await hashFor(ctx, row);
      if (row.contents_hash !== contentsHash) {
        await ctx.db.patch(row._id, { contents_hash: contentsHash });
      }
    },
  });
}

/** Writes each saved draft's Contents hash, so the editor can stop reading the current Edition's Contents. */
export const rulebook_contents_hash_drafts_v1 = contentsHashBackfill('rulebook_drafts', async (_ctx, draft) =>
  rulebookDraftContentsHash((draft as Doc<'rulebook_drafts'>).contents)
);

/** Writes each Edition's Contents hash onto its metadata row, reading the Contents row once. */
export const rulebook_contents_hash_editions_v1 = contentsHashBackfill('rulebook_editions', async (ctx, edition) =>
  rulebookEditionContentsHash(await contentsForRulebookEdition(ctx, edition as Doc<'rulebook_editions'>))
);

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

export const runRequired = internalMutation({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const refs = migrationRefsFor(args.ids);
    const state = await migrations.runSerially(ctx, refs);
    return { started: true, state };
  },
});

export const getStatus = internalQuery({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await migrations.getStatus(ctx, { migrations: listedRefs(args.ids) });
  },
});

/** Recorded runs of listed migrations; rows for pruned ids stay in the table as history. */
function listedRuns(rows: Doc<'migration_runs'>[]) {
  return rows.filter((row) => row.migration_id in MIGRATION_IDS);
}

export const listRunSnapshots = internalQuery({
  args: {},
  handler: async (ctx) => {
    return listedRuns(await ctx.db.query('migration_runs').order('desc').take(200));
  },
});

/** Single subscription for admin UI: live statuses + recorded snapshots. */
export const adminDashboard = adminQuery({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const statuses = await migrations.getStatus(ctx, { migrations: listedRefs(args.ids) });
    const snapshots = listedRuns(await ctx.db.query('migration_runs').order('desc').take(200));
    return { statuses, snapshots };
  },
});

async function syncMigrationRunSnapshots(ctx: MutationCtx, ids?: string[]) {
  const statuses = await migrations.getStatus(ctx, { migrations: listedRefs(ids) });
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
}

export const syncMigrationRuns = mutation({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    return await syncMigrationRunSnapshots(ctx, args.ids);
  },
});

export const syncMigrationRunsForDeploy = internalMutation({
  args: {
    ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await syncMigrationRunSnapshots(ctx, args.ids);
  },
});

export const verifyMigration = internalQuery({
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

export const assertReadyForNarrow = internalQuery({
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

/** Existing boards receive the same small eligibility row as new asset writes. */
export const board_readiness_v1 = migrations.define({
  table: 'assets',
  batchSize: 10,
  migrateOne: async (ctx, asset) => {
    if (asset.type === 'board') {
      await syncBoardReadiness(ctx, asset._id, asset);
    }
  },
});

/**
 * Builds the Faction catalogue's entries from canonical factions, while live writes keep them current through triggers.
 * Reconciling is idempotent, so every snapshot load can replay it over a catalogue that is already exact.
 */
export const catalogue_entries_factions_v1 = migrations.define({
  table: 'factions',
  /* Faction text has no length cap and each reconcile rereads the faction, so a batch stays small, like `faction_cards_v1`. */
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'faction', row._id);
  },
});

function catalogueEntryMigration(mode: 'repair' | 'verify') {
  return migrations.define({
    table: 'catalogue_entries',
    /* One source check reads every list it belongs to. */
    batchSize: 10,
    migrateOne: async (ctx, entry) => {
      if (!isCatalogueKindName(entry.kind)) {
        if (mode === 'verify') {
          throw new Error(`Catalogue entry ${entry._id} has the unknown kind ${entry.kind}.`);
        }
        await ctx.db.delete(entry._id);
        return;
      }
      /* The index selects one entry even when the source's 'all' entry is missing. */
      const first = await ctx.db
        .query('catalogue_entries')
        .withIndex('by_kind_source', (q) => q.eq('kind', entry.kind).eq('source_id', entry.source_id))
        .first();
      if (first?._id !== entry._id) {
        return;
      }
      const checkSource = mode === 'repair' ? repairCatalogueEntry : assertCatalogueSourceExact;
      await checkSource(ctx, entry.kind, entry.source_id);
    },
  });
}

/** Removes entries whose source is gone or unlisted, and duplicates, which a pass over the sources cannot see. */
export const catalogue_entries_prune_v1 = catalogueEntryMigration('repair');

/** Proves every entry, and its aggregate order, equals what its canonical rows say now, so none has drifted or outlived its source. */
export const catalogue_entries_verify_v1 = catalogueEntryMigration('verify');

/** Proves the other direction: every live faction is in each of its lists exactly once, exactly, so an empty or partial catalogue cannot pass. */
export const catalogue_entries_verify_v2 = migrations.define({
  table: 'factions',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'faction', row._id);
  },
});

/**
 * Builds the asset catalogue's entries from canonical assets, while live writes keep them current through triggers.
 * Reconciling is idempotent, so every snapshot load can replay it over a catalogue that is already exact.
 */
export const catalogue_entries_assets_v1 = migrations.define({
  table: 'assets',
  /* Asset data has no length cap and each reconcile rereads the asset and its owner. */
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'asset', row._id);
  },
});

/** Proves every live asset is in its type's list and the whole list exactly once, so an empty or partial asset catalogue cannot pass. */
export const catalogue_entries_assets_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'asset', row._id);
  },
});

/** Builds the profile directory's entries from canonical profiles, while live writes keep them current through triggers. */
export const catalogue_entries_profiles_v1 = migrations.define({
  table: 'profiles',
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'profile', row._id);
  },
});

/** Proves every public profile is in the directory exactly once, so an empty or partial directory cannot pass. */
export const catalogue_entries_profiles_verify_v1 = migrations.define({
  table: 'profiles',
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'profile', row._id);
  },
});

/** Builds every ruleset's FAQ lists from canonical questions, while live writes keep them current through triggers. */
export const catalogue_entries_faq_v1 = migrations.define({
  table: 'faq_items',
  /* A question is written into up to nine lists, each reconcile rereading it, so a batch stays well inside a transaction's limits. */
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'faq', row._id);
  },
});

/** Proves every question is in each of its FAQ lists exactly once, so an empty or partial FAQ cannot pass. */
export const catalogue_entries_faq_verify_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'faq', row._id);
  },
});

/** Gave existing boards the listing fields; `board_readiness_v1` writes the same full row on replay, so this body is a no-op and the id stays for `board_readiness_listing_narrow`. */
export const board_readiness_listing_v1 = migrations.define({
  table: 'assets',
  batchSize: 100,
  migrateOne: async () => {},
});

/** Existing factions receive the card new faction writes already keep; rerunning it writes nothing. */
export const faction_cards_v1 = migrations.define({
  table: 'factions',
  /* Faction text has no length cap, and a rerun reads each faction and its card, so a batch stays small. */
  batchSize: 10,
  migrateOne: async (ctx, faction) => {
    await syncFactionCard(ctx, faction._id, faction);
  },
});
