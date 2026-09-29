import { describe, expect, test } from 'vitest';

import type { Doc, Id } from '../_generated/dataModel';
import { playerSummary } from './playerSummary';

function profile(overrides: Partial<Doc<'profiles'>> = {}): Doc<'profiles'> {
  return {
    _id: 'profile' as Id<'profiles'>,
    _creationTime: 0,
    user_id: 'user' as Id<'users'>,
    username: 'Paul',
    avatar_url: null,
    account_state: 'active',
    slug: 'paul',
    created_at: '2026-09-29T00:00:00.000Z',
    updated_at: '2026-09-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('playerSummary', () => {
  test('carries the profile slug of an active account', () => {
    expect(playerSummary(profile())).toMatchObject({ displayName: 'Paul', profileSlug: 'paul' });
  });

  test('carries no slug for an account that is not active, so the table never links to a closing profile', () => {
    expect(playerSummary(profile({ account_state: 'deletion_pending' })).profileSlug).toBeNull();
    expect(playerSummary(profile({ account_state: 'deleted' })).profileSlug).toBeNull();
  });

  test('carries no slug without a profile', () => {
    expect(playerSummary(null)).toEqual({ displayName: 'Player', avatarUrl: null, profileSlug: null });
  });
});
