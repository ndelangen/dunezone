// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../../../convex/_generated/api';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery } }));
vi.mock('convex/react', () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
}));

import {
  loadGroupDetailBySlug,
  loadGroupEditBySlug,
  useGroupDetailBySlug,
  useGroupEditBySlug,
} from './db';

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
  test('normalizes the canonical detail projection without exposing legacy authorization rows', async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);

    const loaded = await loadGroupDetailBySlug('dune-designers');

    expect(loaded).toEqual({
      group: { ...group, id: 'group-1' },
      factions: [],
      rulesets: [],
      owner,
      viewerAccess,
      roster,
    });
    expect(mocks.dbQuery).toHaveBeenCalledWith(api.groups.detailBySlug, {
      slug: 'dune-designers',
    });

    mocks.useQuery.mockReturnValue(undefined);
    const loaderHandoff = renderHook(() =>
      useGroupDetailBySlug('dune-designers', { initialData: loaded })
    );
    expect(loaderHandoff.result.current.data).toEqual(loaded);
    loaderHandoff.unmount();

    mocks.useQuery.mockReturnValue(serverPage);
    const live = renderHook(() => useGroupDetailBySlug('dune-designers'));
    expect(live.result.current.data).toEqual(loaded);
    expect(mocks.useQuery).toHaveBeenLastCalledWith(api.groups.detailBySlug, {
      slug: 'dune-designers',
    });
    live.unmount();
  });

  test('gives Group edit only its Group and owner capability projection', async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);

    const loaded = await loadGroupEditBySlug('dune-designers');

    expect(loaded).toEqual({
      group: { ...group, id: 'group-1' },
      viewerAccess,
    });

    mocks.useQuery.mockReturnValue(serverPage);
    const live = renderHook(() => useGroupEditBySlug('dune-designers'));
    expect(live.result.current.data).toEqual(loaded);
    live.unmount();
  });
});
