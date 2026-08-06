// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../../../convex/_generated/api';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery, mutation: vi.fn() } }));
vi.mock('convex/react', () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
}));

import { loadProfileBySlug, useProfileBySlug } from './db';

const profile = {
  _id: 'profile-1',
  _creationTime: 1,
  user_id: 'user-1',
  username: 'Chani',
  avatar_url: null,
  slug: 'chani',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
};

const groupSummaries = [
  { id: 'group-2', name: 'Sietch Tabr', slug: 'sietch-tabr' },
  { id: 'group-1', name: 'Fremen Council', slug: 'fremen-council' },
];

const serverPage = {
  profile,
  memberships: [{ _id: 'legacy-membership' }],
  groups: [{ _id: 'legacy-group' }],
  groupSummaries,
  faqAsked: [],
  faqAnswers: [],
  factions: [],
};

const canonicalPage = {
  profile,
  groupSummaries,
  faqAsked: [],
  faqAnswers: [],
  factions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('profile page interface', () => {
  test('normalizes loader and live data to ordered Group summaries without raw membership transport', async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);

    const loaded = await loadProfileBySlug('chani');

    expect(loaded).toEqual(canonicalPage);
    expect(loaded).not.toHaveProperty('memberships');
    expect(loaded).not.toHaveProperty('groups');
    expect(mocks.dbQuery).toHaveBeenCalledWith(api.profiles.getBySlug, { slug: 'chani' });

    mocks.useQuery.mockReturnValue(undefined);
    const loaderHandoff = renderHook(() =>
      useProfileBySlug('chani', { initialData: canonicalPage as never })
    );
    expect(loaderHandoff.result.current.data).toEqual(canonicalPage);
    loaderHandoff.unmount();

    mocks.useQuery.mockReturnValue(serverPage);
    const live = renderHook(() => useProfileBySlug('chani'));
    expect(live.result.current.data).toEqual(canonicalPage);
    expect(live.result.current.groupSummaries).toEqual(groupSummaries);
    expect(live.result.current).not.toHaveProperty('memberships');
    expect(live.result.current).not.toHaveProperty('groups');
    live.unmount();
  });
});
