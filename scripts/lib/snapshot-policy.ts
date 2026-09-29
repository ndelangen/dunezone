import type { WithoutSystemFields } from 'convex/server';
import type { GenericId } from 'convex/values';

import type { Doc, Id, TableNames } from '../../convex/_generated/dataModel';

/**
 * What the anonymised snapshot keeps of each Convex table (#1559).
 *
 * The snapshot holds published content only, as Norbert ruled on #1310.
 * Every table is either dropped or kept, and a kept table names a rule for each of its fields and says which rows count as published.
 * The types below make each gap a compile error: a new table, or a new field on a kept table, fails typecheck until it is classified here.
 */

type SystemField = '_id' | '_creationTime';

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type ReferencedTable<Value> = Value extends GenericId<infer Table> ? Table : never;

type IsOptional<Row, Field extends keyof Row> = object extends Pick<Row, Field> ? true : false;

type ReferenceRule<Value> = [ReferencedTable<Value>] extends [never]
  ? never
  :
      | { parent: ReferencedTable<Value> }
      | (null extends Value ? { orNull: ReferencedTable<Value> } : never)
      | ('users' extends ReferencedTable<Value> ? 'owner' : never);

/**
 * The rule for one field of a kept row.
 *
 * - `keep` copies the value unchanged.
 * - `drop` leaves the field out, which only an optional field allows, so the row still matches the schema.
 * - `owner` replaces a user reference with the placeholder owner, because no `users` row leaves production.
 * - `parent` keeps the row only when the row it points at is kept too.
 * - `orNull` sets a nullable reference to null when the row it points at is not kept.
 *
 * The reference rules name the table the field's validator points at, so a rule aimed at the wrong table does not compile.
 */
type FieldRule<Row, Field extends keyof Row> =
  IsAny<Row[Field]> extends true
    ? 'keep'
    : 'keep' | (IsOptional<Row, Field> extends true ? 'drop' : never) | ReferenceRule<Row[Field]>;

/** A stored row as the export has it: the schema's field names, with values not yet checked. */
type StoredRow<Table extends TableNames> = { readonly [Field in keyof Doc<Table>]?: unknown };

type PublicationStateField = 'is_deleted' | 'account_state' | 'status';

/**
 * Which rows are published.
 * A table with a publication state must say how to read it, so `all` is only offered to tables without one.
 * A predicate compares values strictly, so a row whose state is missing or malformed is dropped.
 */
type RowRule<Table extends TableNames> =
  | ((row: StoredRow<Table>) => boolean)
  | ([Extract<keyof Doc<Table>, PublicationStateField>] extends [never] ? 'all' : never);

type KeptTable<Table extends TableNames> = {
  fields: { [Field in Exclude<keyof Doc<Table>, SystemField>]-?: FieldRule<Doc<Table>, Field> };
  rows: RowRule<Table>;
};

type DroppedTable = { drop: string };

type TablePolicy<Table extends TableNames> = KeptTable<Table> | DroppedTable;

const notDeleted = (row: { readonly is_deleted?: unknown }) => row.is_deleted === false;

export const snapshotPolicy = {
  authAccounts: { drop: 'sign-in accounts' },
  authSessions: { drop: 'sign-in sessions' },
  authRefreshTokens: { drop: 'sign-in tokens' },
  authVerificationCodes: { drop: 'sign-in codes' },
  authVerifiers: { drop: 'sign-in verifiers' },
  authRateLimits: { drop: 'sign-in rate limits' },
  users: { drop: 'accounts carry email, and the placeholder owner stands in for every user' },
  play_games: { drop: 'Play games carry provisioning secrets and are not published content' },
  play_tickets: { drop: 'Play admission tickets' },
  play_auth_registrations: { drop: 'Play sign-in registrations' },
  play_game_accounts: { drop: 'Play account links' },
  play_account_deletions: { drop: 'Play account deletions' },
  user_image_ingest_tokens: { drop: 'image ingest credentials' },
  account_deletion_operations: { drop: 'account deletions' },
  account_deletion_items: { drop: 'account deletions' },
  group_members: { drop: 'excluded by the ruling on #1310' },
  faq_answers: { drop: 'excluded by the ruling on #1310' },
  rulebook_drafts: { drop: 'unpublished drafts' },
  publication_jobs: { drop: 'work claims that must never run outside production' },
  publication_assets: { drop: 'publication records, which every clone already clears' },
  admin_settings: { drop: 'operational settings, not content' },
  counters: { drop: 'slug counters, which the allocators rebuild' },
  migration_runs: { drop: 'migration status, which the local migration guard writes again' },
  cardback_presets: {
    fields: { key: 'keep', cardback: 'keep', revision: 'keep', updated_at: 'keep' },
    rows: 'all',
  },
  /**
   * Only as much as the public `profiles:list` shows for an active profile, and no preference or deletion state.
   * `user_id` stays as it is rather than pointing at the placeholder owner.
   * `profiles:list` already shows it, and every lookup from a user to a profile expects exactly one profile.
   */
  profiles: {
    fields: {
      user_id: 'keep',
      username: 'keep',
      avatar_url: 'keep',
      avatar: 'keep',
      default_group_id: 'drop',
      account_state: 'keep',
      deleted_at: 'drop',
      account_deletion_operation_id: 'drop',
      slug: 'keep',
      created_at: 'keep',
      updated_at: 'keep',
    },
    rows: (row) => row.account_state === 'active',
  },
  groups: {
    fields: { name: 'keep', slug: 'keep', created_at: 'keep', created_by: 'owner', is_deleted: 'keep' },
    rows: notDeleted,
  },
  factions: {
    fields: {
      owner_id: 'owner',
      data: 'keep',
      slug: 'keep',
      created_at: 'keep',
      updated_at: 'keep',
      is_deleted: 'keep',
      group_id: { orNull: 'groups' },
    },
    rows: notDeleted,
  },
  assets: {
    fields: {
      owner_id: 'owner',
      type: 'keep',
      data: 'keep',
      slug: 'keep',
      created_at: 'keep',
      updated_at: 'keep',
      is_deleted: 'keep',
      group_id: { orNull: 'groups' },
    },
    rows: notDeleted,
  },
  asset_relations: {
    fields: {
      from_asset_id: { parent: 'assets' },
      to_asset_id: { parent: 'assets' },
      kind: 'keep',
      count: 'keep',
    },
    rows: 'all',
  },
  rulesets: {
    fields: {
      name: 'keep',
      slug: 'keep',
      about: 'keep',
      created_at: 'keep',
      updated_at: 'keep',
      owner_id: 'owner',
      group_id: { orNull: 'groups' },
      is_deleted: 'keep',
      image_cover: 'keep',
      cover: 'keep',
    },
    rows: notDeleted,
  },
  ruleset_asset_slots: {
    fields: { ruleset_id: { parent: 'rulesets' }, asset_id: { parent: 'assets' }, slot: 'keep' },
    rows: 'all',
  },
  ruleset_factions: {
    fields: { ruleset_id: { parent: 'rulesets' }, faction_id: { parent: 'factions' } },
    rows: 'all',
  },
  rulebooks: {
    fields: {
      ruleset_id: { parent: 'rulesets' },
      settings: 'keep',
      name: 'keep',
      name_key: 'keep',
      slug: 'keep',
      sort_order: 'keep',
      current_edition_number: 'keep',
      created_by: 'owner',
      created_at: 'keep',
      updated_at: 'keep',
      is_deleted: 'keep',
      deleted_at: 'keep',
    },
    rows: notDeleted,
  },
  /** Editions are the published form of a Rulebook, and the public reader shows every one of them. */
  rulebook_editions: {
    fields: {
      rulebook_id: { parent: 'rulebooks' },
      settings: 'keep',
      edition_number: 'keep',
      contents: 'keep',
      created_by: 'owner',
      created_at: 'keep',
    },
    rows: 'all',
  },
  rulebook_edition_contents: {
    fields: { edition_id: { parent: 'rulebook_editions' }, contents: 'keep' },
    rows: 'all',
  },
  rulebook_edition_artifacts: {
    fields: {
      rulebook_id: { parent: 'rulebooks' },
      edition_id: { parent: 'rulebook_editions' },
      edition_number: 'keep',
      kind: 'keep',
      status: 'keep',
      path: 'keep',
      failure_reason: 'keep',
      created_at: 'keep',
      updated_at: 'keep',
    },
    rows: (row) => row.status === 'ready',
  },
  /** Questions are public on their ruleset's FAQ, and their answers are dropped, so no answer is ever accepted. */
  faq_items: {
    fields: {
      ruleset_id: { parent: 'rulesets' },
      slug: 'keep',
      question: 'keep',
      tags: 'keep',
      asked_by: 'owner',
      created_at: 'keep',
      updated_at: 'keep',
      accepted_answer_id: { orNull: 'faq_answers' },
    },
    rows: 'all',
  },
} satisfies { [Table in TableNames]: TablePolicy<Table> };

/**
 * Convex components the export carries under `_components/`.
 * Their tables are derived indexes and rate limits keyed by user, so every one is dropped, and the loaders rebuild what they need.
 * A component not listed here fails the run.
 */
export const droppedComponents: ReadonlySet<string> = new Set([
  'migrations',
  'rateLimiter',
  'statistics',
  'profileDiscovery',
  'profileActivity',
]);

/**
 * The one owner every kept user reference points at.
 * The loaders hand it to local user A, as #1539 hands factions and groups to A.
 * It carries no email, so nobody can sign in as it before a loader links it.
 */
export const placeholderOwner = {
  creationTime: Date.UTC(2024, 0, 1),
  user: (): WithoutSystemFields<Doc<'users'>> => ({ account_state: 'active' }),
  profile: (userId: Id<'users'>): WithoutSystemFields<Doc<'profiles'>> => ({
    user_id: userId,
    username: 'Snapshot owner',
    avatar_url: null,
    account_state: 'active',
    slug: 'snapshot-owner',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  }),
};
