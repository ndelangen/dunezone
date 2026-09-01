import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { directOwnershipKindValidator } from './lib/directOwnership';
import { faqTagValidator } from './lib/faqTags';
import { ingestTokenCapabilityValidator } from './lib/ingestTokens';
import { profileAvatarValidator } from './lib/profileAvatar';
import { rulesetCoverValidator } from './lib/rulesetCover';

const accountStateValidator = v.union(v.literal('active'), v.literal('deletion_pending'), v.literal('deleted'));

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    account_state: v.optional(accountStateValidator),
    deleted_at: v.optional(v.string()),
    account_deletion_operation_id: v.optional(v.id('account_deletion_operations')),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),
  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),
  profiles: defineTable({
    user_id: v.id('users'),
    username: v.union(v.string(), v.null()),
    /**
     * Legacy avatar channel: a URL string, external until the row's rehost lands.
     * During the rehost compatibility window it is dual-written with `avatar.url`, so old readers keep rendering;
     * the retirement release removes it.
     */
    avatar_url: v.union(v.string(), v.null()),
    /**
     * The stored avatar, written only by the rehost pipeline: our delivery URL over one square re-encoded rendition, plus the source it was fetched from.
     * Optional while pre-rehost rows exist, and nulled when a save writes a new external URL so the page renders that URL until the rehost callback lands;
     * `profileAvatars.backfillLegacyAvatars` converts old rows.
     */
    avatar: v.optional(v.union(profileAvatarValidator, v.null())),
    default_group_id: v.optional(v.union(v.id('groups'), v.null())),
    account_state: accountStateValidator,
    deleted_at: v.optional(v.string()),
    account_deletion_operation_id: v.optional(v.id('account_deletion_operations')),
    slug: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index('by_user_id', ['user_id'])
    .index('by_slug', ['slug'])
    .index('by_account_state_username', ['account_state', 'username']),
  groups: defineTable({
    name: v.string(),
    slug: v.string(),
    created_at: v.string(),
    created_by: v.id('users'),
    is_deleted: v.boolean(),
  })
    .index('by_name', ['name'])
    .index('by_slug', ['slug'])
    .index('by_created_by', ['created_by'])
    .index('by_created_by_deleted', ['created_by', 'is_deleted']),
  group_members: defineTable({
    group_id: v.id('groups'),
    user_id: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('removed')),
    requested_at: v.string(),
    approved_at: v.union(v.string(), v.null()),
    approved_by: v.union(v.id('users'), v.null()),
  })
    .index('by_group_user', ['group_id', 'user_id'])
    .index('by_group', ['group_id'])
    .index('by_user', ['user_id'])
    .index('by_user_status', ['user_id', 'status'])
    .index('by_group_status', ['group_id', 'status']),
  factions: defineTable({
    owner_id: v.id('users'),
    data: v.any(),
    slug: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    is_deleted: v.boolean(),
    group_id: v.union(v.id('groups'), v.null()),
  })
    .index('by_deleted', ['is_deleted'])
    .index('by_slug', ['slug'])
    .index('by_owner_id', ['owner_id'])
    .index('by_group_id', ['group_id'])
    .index('by_owner_deleted', ['owner_id', 'is_deleted'])
    .index('by_group_deleted', ['group_id', 'is_deleted']),
  /**
   * Community assets, one table for every Asset category (cards, decks, tokens, boards).
   * `type` is the flat Asset type discriminator (`card-treachery`, `deck`, `token-disc`, …);
   * the browse category is always derived from it, never stored.
   * `data` is validated by the per-type Zod schema at the seams, like factions.
   * Slugs are unique per Asset category, enforced by the slug-reservation mutations, not the schema.
   */
  assets: defineTable({
    owner_id: v.id('users'),
    type: v.string(),
    data: v.any(),
    slug: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    is_deleted: v.boolean(),
    group_id: v.union(v.id('groups'), v.null()),
  })
    .index('by_slug', ['slug'])
    .index('by_deleted', ['is_deleted'])
    .index('by_type_deleted', ['type', 'is_deleted'])
    .index('by_owner_deleted', ['owner_id', 'is_deleted'])
    .index('by_group_deleted', ['group_id', 'is_deleted'])
    .index('by_group_id', ['group_id']),
  /**
   * Asset↔asset references: deck→card memberships (`kind: 'deck-card'`, count = copies) and bundle→token memberships;
   * token backsides moved into `data.back` and their `token-back` rows are dropped by `asset_relations_token_back_drop_v1`;
   * future kinds join the same table.
   * Which types may link (a deck's `to` must be a card) is a rule of the link mutations;
   * the single-table decision traded schema-level reference typing for that.
   * Soft-deleted targets stay referenced;
   * queries filter them out (the faction precedent).
   */
  asset_relations: defineTable({
    from_asset_id: v.id('assets'),
    to_asset_id: v.id('assets'),
    kind: v.string(),
    count: v.number(),
  })
    .index('by_from_kind', ['from_asset_id', 'kind'])
    .index('by_to_kind', ['to_asset_id', 'kind'])
    .index('by_from_to_kind', ['from_asset_id', 'to_asset_id', 'kind']),
  publication_assets: defineTable({
    asset_type: v.string(),
    asset_id: v.string(),
    cache_token: v.string(),
    published_at: v.number(),
  }).index('by_asset_type_and_asset_id', ['asset_type', 'asset_id']),
  publication_jobs: defineTable({
    asset_type: v.string(),
    asset_id: v.string(),
    asset_data: v.any(),
    status: v.union(v.literal('pending'), v.literal('in_progress'), v.literal('error')),
    attempt_counter: v.number(),
    expires_at: v.optional(v.number()),
    error: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index('by_asset_type_and_asset_id', ['asset_type', 'asset_id'])
    .index('by_status_and_created_at', ['status', 'created_at'])
    .index('by_status_and_expires_at', ['status', 'expires_at'])
    .index('by_status_and_updated_at', ['status', 'updated_at']),
  admin_settings: defineTable({
    key: v.literal('publication'),
    publication_pickup_enabled: v.boolean(),
    renderer_revisions: v.record(v.string(), v.number()),
    updated_at: v.number(),
  }).index('by_key', ['key']),
  rulesets: defineTable({
    name: v.string(),
    slug: v.string(),
    about: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    owner_id: v.id('users'),
    group_id: v.union(v.id('groups'), v.null()),
    is_deleted: v.boolean(),
    /**
     * Legacy cover channel: a URL string any bundle generation may still write.
     * During the rehost compatibility window it is dual-written with `cover.url`, so old bundles keep rendering;
     * the retirement release removes it.
     */
    image_cover: v.union(v.string(), v.null()),
    /**
     * The stored cover, written only by the rehost pipeline: our delivery URL over re-encoded bytes, plus the source the author pasted.
     * Optional while pre-rehost rows exist;
     * `rulesetCovers.backfillLegacyCovers` converts them.
     */
    cover: v.optional(v.union(rulesetCoverValidator, v.null())),
  })
    .index('by_name', ['name'])
    .index('by_slug', ['slug'])
    .index('by_owner_deleted', ['owner_id', 'is_deleted'])
    .index('by_group_deleted', ['group_id', 'is_deleted'])
    .index('by_deleted_name', ['is_deleted', 'name']),
  /**
   * Ruleset-owned Rulebook metadata and list placement.
   * Authorship stays on the Ruleset and Contents stay in `rulebook_drafts` and `rulebook_edition_contents`.
   * Deleted rows retain their slug, so restoration keeps the same public identity and later creates cannot reuse it.
   */
  rulebooks: defineTable({
    ruleset_id: v.id('rulesets'),
    name: v.string(),
    name_key: v.string(),
    slug: v.string(),
    sort_order: v.number(),
    current_edition_number: v.number(),
    created_by: v.id('users'),
    created_at: v.string(),
    updated_at: v.string(),
    is_deleted: v.boolean(),
    deleted_at: v.union(v.string(), v.null()),
  })
    .index('by_is_deleted', ['is_deleted'])
    .index('by_ruleset_and_slug', ['ruleset_id', 'slug'])
    .index('by_ruleset_and_is_deleted_and_name_key', ['ruleset_id', 'is_deleted', 'name_key'])
    .index('by_ruleset_and_is_deleted_and_sort_order', ['ruleset_id', 'is_deleted', 'sort_order']),
  /** One mutable saved draft per Rulebook. Every successful Save advances `revision` in the same transaction. */
  rulebook_drafts: defineTable({
    rulebook_id: v.id('rulebooks'),
    revision: v.number(),
    contents: v.any(),
    updated_by: v.id('users'),
    updated_at: v.string(),
  }).index('by_rulebook', ['rulebook_id']),
  /** Immutable Edition metadata. Creation writes Edition 1 beside the matching saved draft. */
  rulebook_editions: defineTable({
    rulebook_id: v.id('rulebooks'),
    edition_number: v.number(),
    /**
     * Legacy inline Contents, optional while `rulebook_edition_contents_v1` moves existing documents out of metadata rows.
     * New Editions write only to `rulebook_edition_contents`.
     */
    contents: v.optional(v.any()),
    created_by: v.id('users'),
    created_at: v.string(),
  }).index('by_rulebook_and_edition_number', ['rulebook_id', 'edition_number']),
  /** One immutable Contents document per Edition, kept separate so history reads touch metadata only. */
  rulebook_edition_contents: defineTable({
    edition_id: v.id('rulebook_editions'),
    contents: v.any(),
  }).index('by_edition_id', ['edition_id']),
  /** Independent delivery state for one immutable Edition's permanent HTML and PDF paths. */
  rulebook_edition_artifacts: defineTable({
    rulebook_id: v.id('rulebooks'),
    edition_id: v.id('rulebook_editions'),
    edition_number: v.number(),
    kind: v.union(v.literal('html'), v.literal('pdf')),
    status: v.union(v.literal('preparing'), v.literal('ready'), v.literal('failed')),
    path: v.string(),
    failure_reason: v.union(v.string(), v.null()),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index('by_edition_and_kind', ['edition_id', 'kind'])
    .index('by_kind_and_status_and_created_at', ['kind', 'status', 'created_at'])
    .index('by_rulebook_and_kind_and_status_and_edition_number', ['rulebook_id', 'kind', 'status', 'edition_number']),
  /**
   * The user-image ingest ledger: one row per minted ingest token, the credential the Worker introspects instead of holding a shared secret.
   * `token_id` is 256 bits of crypto randomness as hex, so possession is the whole credential;
   * `capability` names the one entity and field the token may write;
   * `source_url` is pinned at mint so a token holder cannot rewrite the cover's provenance;
   * `expires` is authoritative on every read regardless of whether the scheduled deletion has run yet.
   * An unconsumed row is deleted by its own mint-scheduled expiry job.
   * A consumed row is kept as a tombstone carrying `r2_keys`, the queryable record of which bucket objects the ingest produced, for the future GC pass.
   */
  user_image_ingest_tokens: defineTable({
    token_id: v.string(),
    capability: ingestTokenCapabilityValidator,
    source_url: v.string(),
    expires: v.number(),
    consumed: v.boolean(),
    r2_keys: v.optional(v.array(v.string())),
  }).index('by_token_id', ['token_id']),
  migration_runs: defineTable({
    migration_id: v.string(),
    state: v.union(
      v.literal('inProgress'),
      v.literal('success'),
      v.literal('failed'),
      v.literal('canceled'),
      v.literal('unknown')
    ),
    is_done: v.boolean(),
    processed: v.number(),
    latest_start: v.number(),
    latest_end: v.optional(v.number()),
    error: v.optional(v.string()),
    updated_at: v.string(),
  })
    .index('by_migration_id', ['migration_id'])
    .index('by_state', ['state']),
  /**
   * Ruleset asset slots.
   * The named slots hold at most one asset each while `custom` and `customTokens` hold any number, and that cardinality is a mutation-level rule rather than schema.
   * Slot names are curatorial labels;
   * the mutations demand only that the asset is of the kind the slot expects, a deck for the three deck slots and a bundle for the two token ones.
   * Which kind a slot accepts is deliberately not a column, since a `kind` field would be a second source of truth able to disagree with `slot`.
   * An empty slot is the absence of a row.
   * Soft-deleted assets stay referenced and are filtered at query time, so the slot presents empty.
   * `by_asset` feeds the deck detail page's "used by these rulesets" view.
   */
  ruleset_asset_slots: defineTable({
    ruleset_id: v.id('rulesets'),
    asset_id: v.id('assets'),
    slot: v.union(
      v.literal('treachery'),
      v.literal('spice'),
      v.literal('custom'),
      v.literal('techToken'),
      v.literal('customTokens')
    ),
  })
    .index('by_ruleset', ['ruleset_id'])
    .index('by_asset', ['asset_id'])
    .index('by_ruleset_slot', ['ruleset_id', 'slot']),
  account_deletion_operations: defineTable({
    source_user_id: v.id('users'),
    source_profile_id: v.id('profiles'),
    replacement_user_id: v.union(v.id('users'), v.null()),
    state: v.union(v.literal('pending'), v.literal('running'), v.literal('completed'), v.literal('failed')),
    phase: v.union(
      v.literal('snapshotting'),
      v.literal('applying'),
      v.literal('verifying'),
      v.literal('finalizing'),
      v.literal('restoring'),
      v.literal('complete')
    ),
    snapshot_kind: v.union(directOwnershipKindValidator, v.null()),
    snapshot_cursor: v.union(v.string(), v.null()),
    retry_count: v.number(),
    error: v.union(v.string(), v.null()),
    created_at: v.string(),
    updated_at: v.string(),
    completed_at: v.union(v.string(), v.null()),
  })
    .index('by_account_state', ['source_user_id', 'state'])
    .index('by_replacement_state', ['replacement_user_id', 'state']),
  account_deletion_items: defineTable({
    operation_id: v.id('account_deletion_operations'),
    kind: directOwnershipKindValidator,
    entity_id: v.union(v.id('groups'), v.id('factions'), v.id('rulesets')),
    was_deleted: v.boolean(),
    state: v.union(v.literal('captured'), v.literal('applied'), v.literal('restored')),
    updated_at: v.string(),
  })
    .index('by_operation_kind_entity', ['operation_id', 'kind', 'entity_id'])
    .index('by_operation_state', ['operation_id', 'state']),
  ruleset_factions: defineTable({
    ruleset_id: v.id('rulesets'),
    faction_id: v.id('factions'),
  })
    .index('by_ruleset', ['ruleset_id'])
    .index('by_faction', ['faction_id'])
    .index('by_ruleset_faction', ['ruleset_id', 'faction_id']),
  faq_items: defineTable({
    ruleset_id: v.id('rulesets'),
    slug: v.string(),
    question: v.string(),
    tags: v.optional(v.array(faqTagValidator)),
    asked_by: v.id('users'),
    created_at: v.string(),
    updated_at: v.string(),
    accepted_answer_id: v.union(v.id('faq_answers'), v.null()),
  })
    .index('by_ruleset_created', ['ruleset_id', 'created_at'])
    .index('by_ruleset_slug', ['ruleset_id', 'slug'])
    .index('by_asked_by_created', ['asked_by', 'created_at']),
  faq_answers: defineTable({
    faq_item_id: v.id('faq_items'),
    answer: v.string(),
    answered_by: v.id('users'),
    created_at: v.string(),
  })
    .index('by_faq_item_created', ['faq_item_id', 'created_at'])
    .index('by_answered_by_created', ['answered_by', 'created_at'])
    .index('by_faq_item_answered_by', ['faq_item_id', 'answered_by']),
});
