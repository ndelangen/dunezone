import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { z } from 'zod';

import { DeckAsset, RectangleTokenAsset, TokenAsset } from '../src/shared/assets/schema';
import { factionExtrasSchema, isLegacyFactionExtra } from '../src/shared/factions/extras';
import {
  assertUniqueFactionMemberIds,
  ensureFactionMemberIds,
  FactionMemberIdSchema,
  factionMembersHaveIds,
} from '../src/shared/factions/memberIdentity';
import {
  assertUniqueFactionTroopIds,
  ensureFactionTroopIds,
  factionTroopsHaveIds,
  FactionTroopIdSchema,
} from '../src/shared/factions/troopIdentity';
import { DEFAULT_FAQ_TAG } from '../src/shared/faq/tags';
import { normalizeFormattedText } from '../src/shared/formattedText';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { CATALOGUE_MIGRATION_IDS } from './catalogueMigrations';
import { adminQuery, internalMutation, mutation } from './functions';
import { accountStateOf } from './lib/accountLifecycle';
import { hasAuthoredBack, TOKEN_ASSET_TYPES, tokenBackOf } from './lib/assetBacks';
import { scheduleSessionExpiry } from './lib/authSessionLifecycle';
import { syncBoardReadiness } from './lib/boardReadiness';
import { assertCatalogueSourceExact, isCatalogueKindName, repairCatalogueEntry } from './lib/catalogueEntries';
import { syncFactionCard } from './lib/factionCards';
import {
  allocateNextFaqItemSlug,
  missingSlug,
  resolveUniqueGroupSlug,
  resolveUniqueRulesetSlug,
  troopHasLegacySupportNames,
  troopWithSupportNames,
} from './lib/migrationHelpers';
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
import { retireHostedFixture } from './playDeletion';
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
  ruleset_factions_position_v1: internal.migrations.ruleset_factions_position_v1,
  catalogue_entries_prune_v1: internal.migrations.catalogue_entries_prune_v1,
  catalogue_entries_verify_v1: internal.migrations.catalogue_entries_verify_v1,
  catalogue_entries_verify_v2: internal.migrations.catalogue_entries_verify_v2,
  faction_member_ids_v1: internal.migrations.faction_member_ids_v1,
  faction_member_ids_verify_v1: internal.migrations.faction_member_ids_verify_v1,
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
  statistics_groups_v1: internal.migrations.statistics_groups_v1,
  statistics_assets_v1: internal.migrations.statistics_assets_v1,
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
  rulebook_edition_artifacts_v1: internal.migrations.rulebook_edition_artifacts_v1,
  rulebook_edition_contents_v1: internal.migrations.rulebook_edition_contents_v1,
  rulebook_edition_contents_verify_v1: internal.migrations.rulebook_edition_contents_verify_v1,
  rulebook_contents_hash_drafts_v1: internal.migrations.rulebook_contents_hash_drafts_v1,
  rulebook_contents_hash_editions_v1: internal.migrations.rulebook_contents_hash_editions_v1,
  faction_extras_references_v1: internal.migrations.faction_extras_references_v1,
  faction_extras_references_verify_v1: internal.migrations.faction_extras_references_verify_v1,
  faction_troop_ids_v1: internal.migrations.faction_troop_ids_v1,
  faction_troop_ids_verify_v1: internal.migrations.faction_troop_ids_verify_v1,
  faction_troop_support_names_v1: internal.migrations.faction_troop_support_names_v1,
  faction_troop_support_names_verify_v1: internal.migrations.faction_troop_support_names_verify_v1,
  faction_faction_leader_key_v1: internal.migrations.faction_faction_leader_key_v1,
  faction_faction_leader_key_verify_v1: internal.migrations.faction_faction_leader_key_verify_v1,
  play_hosted_fixture_retire_v1: internal.migrations.play_hosted_fixture_retire_v1,
  account_connections_expire_v1: internal.migrations.account_connections_expire_v1,
  auth_session_expiry_jobs_v1: internal.migrations.auth_session_expiry_jobs_v1,
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

function toMigrationId(name: string): string {
  const parts = name.split(':');
  return parts[parts.length - 1] ?? name;
}

/* Legacy factions can contain retired assets and fields unrelated to member identity.
   Validate only the roster this migration changes, preserving every other field. */
const migrationFactionMemberSchema = z.looseObject({ memberId: FactionMemberIdSchema.optional() });
const migrationFactionRosterSchema = z.looseObject({
  factionLeader: migrationFactionMemberSchema.optional(),
  /* The glossary term is "Faction leader"; rows saved before `faction_faction_leader_key_v1` hold the Faction leader as `hero`. */
  hero: migrationFactionMemberSchema.optional(),
  leaders: z.array(migrationFactionMemberSchema),
});

/** The roster as `factionLeader ?? hero`, which is how the member migrations read a row from before or after `faction_faction_leader_key_v1`. */
function migrationRosterOf(data: z.infer<typeof migrationFactionRosterSchema>) {
  const factionLeader = data.factionLeader ?? data.hero;
  if (!factionLeader) {
    throw new Error('Faction leader is missing.');
  }
  return { factionLeader, leaders: data.leaders };
}

/** Adds member identities without changing authored fields, the stored Faction leader key or the faction's edit timestamp. */
export const faction_member_ids_v1 = migrations.define({
  table: 'factions',
  migrateOne: async (ctx, row) => {
    const data = migrationFactionRosterSchema.parse(row.data);
    const roster = migrationRosterOf(data);
    const identified = ensureFactionMemberIds(roster);
    if (factionMembersHaveIds(roster)) {
      return;
    }
    await ctx.db.patch('factions', row._id, {
      data: {
        ...data,
        ...(data.factionLeader === undefined ? {} : { factionLeader: identified.factionLeader }),
        ...(data.hero === undefined ? {} : { hero: identified.factionLeader }),
        leaders: identified.leaders,
      },
    });
  },
});

/** Every stored faction, including deleted sources, must pass before member selection is exposed. */
export const faction_member_ids_verify_v1 = migrations.define({
  table: 'factions',
  migrateOne: async (_ctx, row) => {
    const parsed = migrationFactionRosterSchema.safeParse(row.data);
    const roster =
      parsed.success && (parsed.data.factionLeader ?? parsed.data.hero) ? migrationRosterOf(parsed.data) : null;
    if (!roster || !factionMembersHaveIds(roster)) {
      throw new Error(`Faction ${row._id} has missing or duplicate member identities.`);
    }
    assertUniqueFactionMemberIds(roster);
  },
});

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

/**
 * Retains the completed vector-train decal retune identity (wayfinder #307).
 * Its body multiplied each stored decal scale by a frozen factor, which is right once and wrong on every later pass.
 * Production finished it, and a loaded snapshot carries no migration state, so each load would have scaled production's retuned decals a second time.
 */
export const faction_decal_retune_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async () => undefined,
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
 * Narrowing ahead of both is a silent break, because every strict read of a row without the key fails: the edit organs route to the schema-drift dead end, and `readJobForRender` throws on a stale publication job.
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
 * The modes a token back can wear, read off the back unions of both token schemas.
 * Every snapshot load replays the verify below over today's tokens, so a list written into the verify would refuse a mode added after it shipped.
 */
const TOKEN_BACK_MODES: ReadonlySet<unknown> = new Set(
  [TokenAsset, RectangleTokenAsset].flatMap((schema) =>
    schema.shape.back.options.map((member) => member.shape.mode.value)
  )
);

/**
 * Proves the move left nothing behind: every token back wears a mode the token schemas accept, every reference carries its target in data, and no `token-back` relation row remains.
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
    if (!back || !TOKEN_BACK_MODES.has(back.mode)) {
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

/**
 * The modes a tagged deck cardback can wear, read off the schema's own union.
 * A loaded snapshot carries no migration state, so every load replays the verify below over today's decks, and a list written into the verify would refuse a mode added after it shipped.
 */
const TAGGED_DECK_CARDBACK_MODES: ReadonlySet<unknown> = new Set(
  DeckAsset.shape.cardback.options.flatMap((member) => ('mode' in member.shape ? [member.shape.mode.value] : []))
);

/** Proves every deck cardback wears a mode, which is what makes removing the bare transitional member safe later. */
export const assets_deck_cardback_wrap_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    if (row.type !== 'deck') {
      return;
    }
    const cardback = (row.data as { cardback?: { mode?: unknown } } | null)?.cardback;
    if (!TAGGED_DECK_CARDBACK_MODES.has(cardback?.mode)) {
      throw new Error(`Deck ${row._id} still has an untagged cardback`);
    }
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

/**
 * Moved historical inline Contents into the one-to-one Contents table and cleared the metadata row.
 * Production has run it, and the schema no longer has an inline field to move, so its body is a no-op.
 * Its id stays so the narrow guard can require it and every snapshot load can replay it.
 */
export const rulebook_edition_contents_v1 = migrations.define({
  table: 'rulebook_editions',
  batchSize: 50,
  migrateOne: async () => {},
});

/** Proves every Edition has its one Contents row; the schema itself now rules out inline Contents. */
export const rulebook_edition_contents_verify_v1 = migrations.define({
  table: 'rulebook_editions',
  batchSize: 4,
  migrateOne: async (ctx, edition) => {
    await contentsForRulebookEdition(ctx, edition);
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

export const runDeployMigrations = migrations.runner([
  internal.migrations.faction_member_ids_v1,
  internal.migrations.faction_member_ids_verify_v1,
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
  internal.migrations.rulebook_edition_artifacts_v1,
  internal.migrations.rulebook_edition_contents_v1,
  internal.migrations.rulebook_edition_contents_verify_v1,
]);

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
    const refs = args.ids ? migrationRefsFor(args.ids) : undefined;
    return await migrations.getStatus(ctx, { migrations: refs, limit: 100 });
  },
});

export const listRunSnapshots = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('migration_runs').order('desc').take(100);
  },
});

/** Single subscription for admin UI: live statuses + recorded snapshots. */
export const adminDashboard = adminQuery({
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

async function syncMigrationRunSnapshots(ctx: MutationCtx, ids?: string[]) {
  const refs = ids ? migrationRefsFor(ids) : undefined;
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

/** Drops the retired TTS link lists from faction `extras` (#1226); catalogue references stay, and an emptied list is removed. */
export const faction_extras_references_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = row.data as { extras?: unknown } | null;
    if (!data || !Array.isArray(data.extras) || !data.extras.some(isLegacyFactionExtra)) {
      return;
    }
    const { extras, ...rest } = data;
    const references = (extras as unknown[]).filter((entry) => !isLegacyFactionExtra(entry));
    return { data: references.length === 0 ? rest : { ...rest, extras: references } };
  },
});

/** Proves every faction's `extras` is absent or a list of catalogue references, so the tolerant read can go later. */
export const faction_extras_references_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const extras = (row.data as { extras?: unknown } | null)?.extras;
    if (extras !== undefined && !factionExtrasSchema.safeParse(extras).success) {
      throw new Error(`Faction ${row._id} still has Extras that are not catalogue references`);
    }
  },
});

/* Like the member migration, validate only the troops this migration changes and keep every other field as stored. */
const migrationFactionTroopsSchema = z.looseObject({
  troops: z.array(z.looseObject({ troopId: FactionTroopIdSchema.optional() })),
});

/**
 * Adds troop identities (#1227) without changing authored fields or the faction's edit timestamp.
 * Listed in migration-guards.json one release after the schema widened (#1482): deploy migrates before the game and publisher Workers ship, so every reader had to accept `troopId` first.
 */
export const faction_troop_ids_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) =>
    namingFaction(row._id, () => {
      const data = migrationFactionTroopsSchema.parse(row.data);
      return factionTroopsHaveIds(data) ? undefined : { data: ensureFactionTroopIds(data) };
    }),
});

/** Every stored faction, including deleted sources, must carry unique troop identities before the optional field narrows. */
export const faction_troop_ids_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const parsed = migrationFactionTroopsSchema.safeParse(row.data);
    if (!parsed.success || !factionTroopsHaveIds(parsed.data)) {
      throw new Error(`Faction ${row._id} has missing troop identities.`);
    }
    namingFaction(row._id, () => assertUniqueFactionTroopIds(parsed.data));
  },
});

/**
 * Renames each troop face's `fundedStrength` and `fundingCost` to `supportedStrength` and `supportCost`, without changing the faction's edit timestamp.
 * Troops paid for with spice in battle are supported, not funded.
 * A value already under the new name wins, so a replay changes nothing.
 * Not yet listed in migration-guards.json: deploy migrates before the game and publisher Workers ship, so it is listed one release after the widened read, as `faction_troop_ids_v1` was (#1482).
 * Narrowing, which drops the legacy names from the live faction schema, is a later release gated on this and its verify.
 */
export const faction_troop_support_names_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = row.data as { troops?: unknown } | null;
    if (!data || !Array.isArray(data.troops) || !data.troops.some(troopHasLegacySupportNames)) {
      return;
    }
    return { data: { ...data, troops: data.troops.map(troopWithSupportNames) } };
  },
});

/** Every stored faction, including deleted sources, must carry only the supported names before the schema narrows. */
export const faction_troop_support_names_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const troops = (row.data as { troops?: unknown } | null)?.troops;
    if (Array.isArray(troops) && troops.some(troopHasLegacySupportNames)) {
      throw new Error(`Faction ${row._id} still has troop faces with funded names.`);
    }
  },
});

/* The glossary term is "Faction leader".
   Validate only the two keys this migration reads and keep every other field as stored. */
const migrationFactionLeaderKeySchema = z.looseObject({
  factionLeader: z.unknown().optional(),
  hero: z.unknown().optional(),
});

/**
 * Copies the Faction leader from the old `hero` key to `factionLeader`, without changing authored fields or the faction's edit timestamp.
 * The old key stays on the row.
 * Dropping it is the narrowing, left for a later PR together with `readFactionLeaderKey`.
 */
export const faction_faction_leader_key_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = migrationFactionLeaderKeySchema.parse(row.data);
    return data.factionLeader !== undefined || data.hero === undefined
      ? undefined
      : { data: { ...data, factionLeader: data.hero } };
  },
});

/** Every stored faction, including deleted sources, must carry `factionLeader` before the narrowing drops `hero`. */
export const faction_faction_leader_key_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const parsed = migrationFactionLeaderKeySchema.safeParse(row.data);
    if (!parsed.success || parsed.data.factionLeader === undefined) {
      throw new Error(`Faction ${row._id} has no \`factionLeader\`.`);
    }
  },
});

/** A deploy that stops on one faction names the row, so the failure can be found. */
function namingFaction<T>(factionId: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw new Error(`Faction ${factionId}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/**
 * Retires the hosted fixture (#1535): its room deletes what it stored, then the account deletions routed to it settle.
 * Listed in migration-guards.json once the game Worker that answers a retirement has shipped (#1544).
 */
export const play_hosted_fixture_retire_v1 = migrations.define({
  table: 'play_games',
  migrateOne: async (ctx, game) => {
    await retireHostedFixture(ctx, game);
  },
});

/** Previously accepted connection credentials may have outlived their scheduled expiry. */
export const account_connections_expire_v1 = migrations.define({
  table: 'account_connections',
  batchSize: 50,
  migrateOne: (_ctx, row) =>
    Promise.resolve(
      row.state !== 'expired' && row.expires_at <= Date.now() ? { state: 'expired' as const } : undefined
    ),
});

/** Existing sessions receive the same deadline cleanup as new sign-ins. */
export const auth_session_expiry_jobs_v1 = migrations.define({
  table: 'authSessions',
  batchSize: 50,
  migrateOne: async (ctx, session) => {
    await scheduleSessionExpiry(ctx, session);
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

/* A source check covers all its lists; the index chooses one entry even when its 'all' entry is missing. */
async function isFirstCatalogueEntryForSource(ctx: MutationCtx, entry: Doc<'catalogue_entries'>) {
  const first = await ctx.db
    .query('catalogue_entries')
    .withIndex('by_kind_source', (q) => q.eq('kind', entry.kind).eq('source_id', entry.source_id))
    .first();
  return first?._id === entry._id;
}

/** Removes entries whose source is gone or unlisted, and duplicates, which a pass over the sources cannot see. */
export const catalogue_entries_prune_v1 = migrations.define({
  table: 'catalogue_entries',
  /* One repair reads the source and every list it belongs to. */
  batchSize: 10,
  migrateOne: async (ctx, entry) => {
    if (!isCatalogueKindName(entry.kind)) {
      await ctx.db.delete(entry._id);
      return;
    }
    if (await isFirstCatalogueEntryForSource(ctx, entry)) {
      await repairCatalogueEntry(ctx, entry.kind, entry.source_id);
    }
  },
});

/** Proves every entry, and its aggregate order, equals what its canonical rows say now, so none has drifted or outlived its source. */
export const catalogue_entries_verify_v1 = migrations.define({
  table: 'catalogue_entries',
  /* One verification reads the source and every list it belongs to. */
  batchSize: 10,
  migrateOne: async (ctx, entry) => {
    if (!isCatalogueKindName(entry.kind)) {
      throw new Error(`Catalogue entry ${entry._id} has the unknown kind ${entry.kind}.`);
    }
    if (await isFirstCatalogueEntryForSource(ctx, entry)) {
      await assertCatalogueSourceExact(ctx, entry.kind, entry.source_id);
    }
  },
});

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

/** Gives every existing ruleset link a place in its ruleset's order: its creation time, which keeps the order links were made in and sorts before any later append. Rerunning it writes nothing. */
export const ruleset_factions_position_v1 = migrations.define({
  table: 'ruleset_factions',
  migrateOne: async (ctx, link) => {
    /* Every link carries a position once the schema requires it, so this only matters to a manifest replay; the cast reads past the narrowed type. */
    if ((link as Partial<typeof link>).position === undefined) {
      await ctx.db.patch('ruleset_factions', link._id, { position: link._creationTime });
    }
  },
});

/** Existing boards gain the listing fields new asset writes already carry; rerunning it writes nothing. */
export const board_readiness_listing_v1 = migrations.define({
  table: 'assets',
  batchSize: 10,
  migrateOne: async (ctx, asset) => {
    if (asset.type === 'board') {
      await syncBoardReadiness(ctx, asset._id, asset);
    }
  },
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
