import { ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

const OTHER_OWNER_KEY = 'other-owner';
const STORY_TIME = '2026-01-01T12:00:00.000Z';

/**
 * Hands every Group in the baseline to someone else, so the viewer's standing towards it is whatever the story then seeds: none by default.
 * The viewer's own membership rows go;
 * the new owner takes an active one, since a Group always has its owner on the roster.
 */
export function strangerOwnsTheGroups(baseline: StorybookDatabase) {
  baseline.users.push({ $key: OTHER_OWNER_KEY, name: 'Reverend Mother' });
  baseline.profiles.push({
    $key: 'other-owner-profile',
    user_id: ref(OTHER_OWNER_KEY),
    username: 'reverend-mother',
    avatar_url: null,
    account_state: 'active',
    slug: 'reverend-mother',
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
  });
  baseline.group_members = [];
  for (const group of baseline.groups) {
    group.created_by = ref(OTHER_OWNER_KEY);
    baseline.group_members.push({
      group_id: ref(group.$key!),
      user_id: ref(OTHER_OWNER_KEY),
      status: 'active',
      requested_at: STORY_TIME,
      approved_at: STORY_TIME,
      approved_by: ref(OTHER_OWNER_KEY),
    });
  }
}

/** Gives the viewer one membership row of the given standing in every baseline Group, as the other owner's doing. */
export function viewerStandsAs(baseline: StorybookDatabase, status: 'pending' | 'active' | 'invited') {
  for (const group of baseline.groups) {
    baseline.group_members.push({
      group_id: ref(group.$key!),
      user_id: ref('storybook-viewer'),
      status,
      requested_at: STORY_TIME,
      approved_at: status === 'active' ? STORY_TIME : null,
      approved_by: status === 'pending' ? null : ref(OTHER_OWNER_KEY),
    });
  }
}

/** Someone the baseline viewer's own Group has invited, with a public profile to be named by. */
export function invitedGuest(baseline: StorybookDatabase) {
  baseline.users.push({ $key: 'invited-guest', name: 'Liet Kynes' });
  baseline.profiles.push({
    $key: 'invited-guest-profile',
    user_id: ref('invited-guest'),
    username: 'liet-kynes',
    avatar_url: null,
    account_state: 'active',
    slug: 'liet-kynes',
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
  });
  for (const group of baseline.groups) {
    baseline.group_members.push({
      group_id: ref(group.$key!),
      user_id: ref('invited-guest'),
      status: 'invited',
      requested_at: STORY_TIME,
      approved_at: null,
      approved_by: ref('storybook-viewer'),
    });
  }
}
