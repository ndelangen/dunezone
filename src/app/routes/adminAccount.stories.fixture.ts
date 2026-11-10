import { TUTORIAL_PLAYERS } from '@shared/tutorial/players';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

/** The public tutorial profile supplies the identity; the moderation state exists only in Storybook. */
function managedProfile(baseline: StorybookDatabase, banned = false) {
  const person = TUTORIAL_PLAYERS[1]!;
  baseline.users.push({
    $key: 'managed-account',
    name: person.name,
    account_state: banned ? 'banned' : 'active',
    ...(banned
      ? {
          banned_at: '2026-11-10T12:00:00Z',
          banned_by: ref('storybook-viewer'),
          banned_reason: 'Storybook moderation example.',
        }
      : {}),
  });
  baseline.profiles.push({
    ...baseline.profiles[0]!,
    $key: 'managed-profile',
    user_id: ref('managed-account'),
    username: person.name,
    slug: person.slug,
    avatar_url: person.avatar,
    account_state: banned ? 'banned' : 'active',
  });
}

export const managedAccountPath = `/admin/account/${TUTORIAL_PLAYERS[1]!.slug}`;
export const activeAccount = db((baseline) => managedProfile(baseline));
export const bannedAccount = db((baseline) => managedProfile(baseline, true));
export const bannedViewer = db((baseline) => {
  baseline.users[0]!.account_state = 'banned';
  baseline.profiles[0]!.account_state = 'banned';
});

function seedBanOperation(baseline: StorybookDatabase, completed = false) {
  managedProfile(baseline, true);
  const operationId = ref('ban-operation');
  baseline.users.find((user) => user.$key === 'managed-account')!.$patch = {
    account_deletion_operation_id: operationId,
  };
  baseline.account_deletion_operations.push({
    $key: 'ban-operation',
    kind: 'ban',
    initiator_user_id: ref('storybook-viewer'),
    source_user_id: ref('managed-account'),
    source_profile_id: ref('managed-profile'),
    replacement_user_id: null,
    ban_games_queued: completed,
    ban_accounts_queued: completed,
    state: completed ? 'completed' : 'failed',
    phase: completed ? 'complete' : 'snapshotting',
    snapshot_kind: completed ? null : 'group',
    snapshot_cursor: null,
    retry_count: 0,
    error: completed
      ? null
      : 'The content operation was interrupted. Resume to continue from the last completed batch.',
    created_at: '2026-11-10T12:00:00Z',
    updated_at: '2026-11-10T12:00:00Z',
    completed_at: completed ? '2026-11-10T12:05:00Z' : null,
  });
}

export const failedBanOperation = db((baseline) => seedBanOperation(baseline));

/** Content removal has finished; Discord still has the channel while deletion waits for a retry. */
export const pendingDiscordDeletion = db((baseline) => {
  seedBanOperation(baseline, true);
  baseline.play_games.push({
    $key: 'removed-game',
    name: baseline.rulesets[0]!.name,
    slug: 'removed-game',
    creator_id: ref('managed-account'),
    ban_operation_id: ref('ban-operation'),
    state: 'expired',
    secret: 'story-only-secret',
    attempt_id: 'story-only-attempt',
    provision_expires_at: 0,
    created_at: 0,
  });
  baseline.play_game_discord_channels.push({
    game_id: ref('removed-game'),
    ban_operation_id: ref('ban-operation'),
    guild_id: '100',
    category_ids: ['200'],
    channel_id: '300',
    state: 'deleting',
    created_at: 0,
    cleanup_at: 0,
    next_attempt_at: 4_102_444_800_000,
  });
});
