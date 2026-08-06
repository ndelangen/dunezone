// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery } }));
vi.mock('convex/react', () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
}));

import { loadGroupEditBySlug, useGroupEditBySlug } from './db';

const group = {
  _id: 'group-1',
  _creationTime: 1,
  name: 'Dune Designers',
  slug: 'dune-designers',
  created_at: '2026-08-05T00:00:00.000Z',
  created_by: 'user-owner',
};

const owner = {
  id: 'profile-owner',
  slug: 'group-owner',
  username: 'Group owner',
  avatar_url: null,
};

const viewerAccess = {
  kind: 'group' as const,
  viewer: { kind: 'authenticated' as const, membership: 'active' as const },
  capabilities: {
    requestMembership: false,
    rename: true,
    delete: true,
    addMember: true,
  },
};

const roster = [
  {
    membershipId: 'membership-owner',
    user: owner,
    status: 'active' as const,
    requestedAt: '2026-08-05T00:00:00.000Z',
    capabilities: { approve: false, reject: false, remove: false },
  },
];

const serverPage = {
  group,
  factions: [],
  rulesets: [],
  owner,
  viewerAccess,
  roster,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Group page interface', () => {
  test('gives Group edit only its Group and owner capability projection', async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);

    const loaded = await loadGroupEditBySlug('dune-designers');

    expect(Object.keys(loaded).sort()).toEqual(['group', 'viewerAccess']);
    expect(loaded.group.id).toBe('group-1');

    mocks.useQuery.mockReturnValue(serverPage);
    const live = renderHook(() => useGroupEditBySlug('dune-designers'));
    expect(live.result.current.data).toEqual(loaded);
    live.unmount();
  });
});
