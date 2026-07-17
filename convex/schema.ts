import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { FAQ_TAG_VALUES } from '../src/app/faq/tags';

const faqTagValidator = v.union(
  v.literal(FAQ_TAG_VALUES[0]),
  v.literal(FAQ_TAG_VALUES[1]),
  v.literal(FAQ_TAG_VALUES[2]),
  v.literal(FAQ_TAG_VALUES[3]),
  v.literal(FAQ_TAG_VALUES[4]),
  v.literal(FAQ_TAG_VALUES[5])
);

export default defineSchema({
  ...authTables,
  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),
  profiles: defineTable({
    user_id: v.id('users'),
    username: v.union(v.string(), v.null()),
    avatar_url: v.union(v.string(), v.null()),
    slug: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index('by_user_id', ['user_id'])
    .index('by_slug', ['slug']),
  groups: defineTable({
    name: v.string(),
    slug: v.string(),
    created_at: v.string(),
    created_by: v.id('users'),
  })
    .index('by_name', ['name'])
    .index('by_slug', ['slug'])
    .index('by_created_by', ['created_by']),
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
  asset_targets: defineTable({
    faction_id: v.id('factions'),
    asset_type: v.literal('faction_sheet'),
    desired_generation: v.number(),
    desired_renderer_version: v.string(),
    published_generation: v.optional(v.number()),
    published_renderer_version: v.optional(v.string()),
    published_cache_token: v.optional(v.string()),
    published_r2_etag: v.optional(v.string()),
    published_bytes: v.optional(v.number()),
    published_at: v.optional(v.number()),
    first_publication_admitted: v.optional(v.boolean()),
    status: v.union(
      v.literal('pending'),
      v.literal('leased'),
      v.literal('current'),
      v.literal('cooldown')
    ),
    next_eligible_at: v.number(),
    attempt_count: v.number(),
    last_error: v.optional(v.string()),
    batch_token: v.optional(v.string()),
    claim_token: v.optional(v.string()),
    claimed_generation: v.optional(v.number()),
    claimed_renderer_version: v.optional(v.string()),
    lease_expires_at: v.optional(v.number()),
    claim_payload_hash: v.optional(v.string()),
    last_completed_batch_token: v.optional(v.string()),
    last_completed_claim_token: v.optional(v.string()),
    work_lane: v.optional(v.union(v.literal('foreground'), v.literal('rollout'))),
    rollout_id: v.optional(v.id('asset_rollouts')),
    rollout_item_id: v.optional(v.id('asset_rollout_items')),
    foreground_updated_at: v.optional(v.number()),
  })
    .index('by_faction_id_and_asset_type', ['faction_id', 'asset_type'])
    .index('by_asset_type_and_status_and_next_eligible_at', [
      'asset_type',
      'status',
      'next_eligible_at',
    ])
    .index('by_asset_type_and_status_and_lease_expires_at', [
      'asset_type',
      'status',
      'lease_expires_at',
    ])
    .index('by_asset_type_and_admitted_and_status_and_next_eligible_at', [
      'asset_type',
      'first_publication_admitted',
      'status',
      'next_eligible_at',
    ])
    .index('by_asset_type_and_admitted_and_status_and_lease_expires_at', [
      'asset_type',
      'first_publication_admitted',
      'status',
      'lease_expires_at',
    ])
    .index('by_asset_type_and_published_generation', ['asset_type', 'published_generation'])
    .index('by_asset_type', ['asset_type'])
    .index('by_type_lane_status_eligible', [
      'asset_type',
      'work_lane',
      'status',
      'next_eligible_at',
    ])
    .index('by_type_lane_status_lease', ['asset_type', 'work_lane', 'status', 'lease_expires_at'])
    .index('by_type_lane_admitted_status_eligible', [
      'asset_type',
      'work_lane',
      'first_publication_admitted',
      'status',
      'next_eligible_at',
    ])
    .index('by_type_lane_admitted_status_lease', [
      'asset_type',
      'work_lane',
      'first_publication_admitted',
      'status',
      'lease_expires_at',
    ])
    .index('by_batch_token', ['batch_token']),
  asset_claim_snapshots: defineTable({
    target_id: v.id('asset_targets'),
    faction_id: v.id('factions'),
    asset_type: v.literal('faction_sheet'),
    batch_token: v.string(),
    claim_token: v.string(),
    generation: v.number(),
    renderer_version: v.string(),
    lease_expires_at: v.number(),
    payload_hash: v.string(),
    payload: v.any(),
  })
    .index('by_target_id', ['target_id'])
    .index('by_batch_token', ['batch_token']),
  asset_type_configs: defineTable({
    asset_type: v.literal('faction_sheet'),
    status: v.union(v.literal('disabled'), v.literal('active'), v.literal('paused')),
    active_renderer_version: v.string(),
    active_rollout_id: v.optional(v.id('asset_rollouts')),
    updated_at: v.number(),
  }).index('by_asset_type', ['asset_type']),
  asset_publisher_state: defineTable({
    key: v.literal('singleton'),
    status: v.union(v.literal('disabled'), v.literal('active'), v.literal('paused')),
    batch_token: v.optional(v.string()),
    batch_lease_expires_at: v.optional(v.number()),
    cooldown_until: v.number(),
    daily_browser_utc_date: v.optional(v.string()),
    daily_browser_ms: v.optional(v.number()),
    browser_reservation_batch_token: v.optional(v.string()),
    browser_reservation_utc_date: v.optional(v.string()),
    browser_reserved_ms: v.optional(v.number()),
    last_browser_settlement_batch_token: v.optional(v.string()),
    last_browser_settlement_ms: v.optional(v.number()),
    last_browser_release_batch_token: v.optional(v.string()),
    last_browser_release_mode: v.optional(
      v.union(v.literal('no_browser'), v.literal('after_settlement'))
    ),
    next_lane: v.union(v.literal('foreground'), v.literal('rollout')),
    lane_sequence_position: v.optional(v.number()),
  }).index('by_key', ['key']),
  asset_rollouts: defineTable({
    asset_type: v.literal('faction_sheet'),
    target_renderer_version: v.string(),
    rollback_of_rollout_id: v.optional(v.id('asset_rollouts')),
    status: v.union(
      v.literal('discovering'),
      v.literal('running'),
      v.literal('paused'),
      v.literal('cancelling'),
      v.literal('cancelled'),
      v.literal('completed'),
      v.literal('completed_with_errors')
    ),
    cutoff_creation_time: v.number(),
    discovery_cursor: v.optional(v.string()),
    discovery_sealed_at: v.optional(v.number()),
    discovery_pages: v.number(),
    discovery_continuations: v.number(),
    discovered: v.number(),
    pending: v.number(),
    leased: v.number(),
    succeeded: v.number(),
    superseded: v.number(),
    cancelled: v.number(),
    terminal_errors: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index('by_asset_type_and_status', ['asset_type', 'status'])
    .index('by_status_and_updated_at', ['status', 'updated_at']),
  asset_rollout_items: defineTable({
    rollout_id: v.id('asset_rollouts'),
    target_id: v.id('asset_targets'),
    enrolled_generation: v.number(),
    enrolled_renderer_version: v.string(),
    previous_renderer_version: v.optional(v.string()),
    state: v.union(
      v.literal('pending'),
      v.literal('leased'),
      v.literal('succeeded'),
      v.literal('superseded'),
      v.literal('cancelled'),
      v.literal('terminal_error')
    ),
    retry_count: v.number(),
    next_eligible_at: v.number(),
    last_error: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index('by_rollout_id_and_target_id', ['rollout_id', 'target_id'])
    .index('by_rollout_id_and_state_and_next_eligible_at', [
      'rollout_id',
      'state',
      'next_eligible_at',
    ])
    .index('by_target_id_and_rollout_id', ['target_id', 'rollout_id']),
  rulesets: defineTable({
    name: v.string(),
    slug: v.string(),
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
