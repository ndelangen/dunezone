import type { WithoutSystemFields } from 'convex/server';
import type { GenericId } from 'convex/values';

import type { components } from '../../convex/_generated/api';
import type { Doc, Id, TableNames } from '../../convex/_generated/dataModel';
import { rulebookEditionContentsV1Schema } from '../../src/shared/rulebooks/contents';
import { readerContents } from '../../src/shared/rulebooks/readerContents';

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
 * Rewrites an untyped value into what the public reads of it.
 * It throws on a value it cannot read, and the run then stops.
 */
type Projection = { project: (value: unknown) => unknown };

/**
 * The rule for one field of a kept row.
 *
 * - `keep` copies the value unchanged.
 * - `drop` leaves the field out, which only an optional field allows, so the row still matches the schema.
 * - `owner` replaces a user reference with the placeholder owner, because no `users` row leaves production.
 * - `parent` keeps the row only when the row it points at is kept too, and drops a row that has no such reference.
 * - `orNull` sets a nullable reference to null when the row it points at is not kept.
 * - `project` writes the value as a public read shows it, for an untyped field whose public read hides part of it.
 *
 * The reference rules name the table the field's validator points at, so a rule aimed at the wrong table does not compile.
 */
type FieldRule<Row, Field extends keyof Row> =
  IsAny<Row[Field]> extends true
    ? 'keep' | Projection
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

/**
 * Edition Contents as the public reader returns them.
 * A cover keeps its rehosted image, and the source URL the author pasted, which can be a signed link, stays in production.
 */
const readerEditionContents: Projection = {
  project: (value) => readerContents(rulebookEditionContentsV1Schema.parse(value)),
};

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
      contents: readerEditionContents,
      created_by: 'owner',
      created_at: 'keep',
    },
    rows: 'all',
  },
  rulebook_edition_contents: {
    fields: { edition_id: { parent: 'rulebook_editions' }, contents: readerEditionContents },
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
 * Tables production still holds that `convex/schema.ts` no longer declares, each dropped by name.
 * Convex keeps a table after it leaves the schema, so the export carries it.
 * A key that is also a schema table fails typecheck, so a table that comes back must be classified in the policy above.
 * #1576 tracks deleting these tables from production.
 */
export const retiredTables = {
  /* Left the schema in 2304c35e5e9, after `asset_claim_snapshots_retire_v1` deleted its rows. */
  asset_claim_snapshots: 'retired asset publisher bookkeeping, not content',
  /* Left the schema in 2304c35e5e9, after `asset_publisher_state_retire_v1` deleted its rows. */
  asset_publisher_state: 'retired asset publisher bookkeeping, not content',
  /* The last four left the schema in c99f69fa75e, after the `publication_delete_legacy_*_v1` migrations deleted their rows. */
  asset_targets: 'retired asset publisher bookkeeping, not content',
  asset_type_configs: 'retired asset publisher bookkeeping, not content',
  asset_rollouts: 'retired asset publisher bookkeeping, not content',
  asset_rollout_items: 'retired asset publisher bookkeeping, not content',
} satisfies Record<string, string> & { [Table in TableNames]?: never };

/**
 * Convex components the app installs in `convex/convex.config.ts`, each dropped by name with its reason.
 * Codegen writes the same names into `components` in `convex/_generated/api.d.ts`, so a component added or removed there fails typecheck until it is classified here.
 */
export const installedComponents = {
  migrations: 'migration progress, which belongs to the deployment that ran it',
  rateLimiter: 'rate limits keyed by user',
  statistics: 'derived counts and the ids they count, which the loaders rebuild',
  profileDiscovery: 'a derived index, which the loaders rebuild',
  profileActivity: 'derived counts per user and the ids they count, which the loaders rebuild',
} satisfies { [Name in keyof typeof components]: string };

/**
 * Components production still holds after the app stopped installing them, each dropped by name.
 * Convex keeps an unmounted component's data until the component is deleted in the dashboard, and the export carries it.
 * A key that is also an installed component fails typecheck.
 * #1576 tracks deleting these components from production.
 */
export const retiredComponents = {
  /* Unmounted in 41c443122f2 (#176). */
  homepageCommunity: 'the retired homepage aggregate: derived counts and the ids they count',
} satisfies Record<string, string> & { [Name in keyof typeof components]?: never };

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
