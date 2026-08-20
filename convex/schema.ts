import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { directOwnershipKindValidator } from './lib/directOwnership';
import { faqTagValidator } from './lib/faqTags';

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
    avatar_url: v.union(v.string(), v.null()),
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
    /**
     * Narrowed by `rulesets_description_narrow` once every row carried a value.
     * Empty is what the backfill gave rows that predate the field, and it stays readable;
     * anything written goes through `rulesetDescriptionSchema`, which demands 50 characters.
     */
    description: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    owner_id: v.id('users'),
    group_id: v.union(v.id('groups'), v.null()),
    is_deleted: v.boolean(),
    image_cover: v.union(v.string(), v.null()),
  })
    .index('by_name', ['name'])
    .index('by_slug', ['slug'])
    .index('by_owner_deleted', ['owner_id', 'is_deleted'])
    .index('by_group_deleted', ['group_id', 'is_deleted'])
    .index('by_deleted_name', ['is_deleted', 'name']),
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
