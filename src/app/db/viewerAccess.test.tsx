// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  memberships: new Map<string | null, string | undefined>(),
  session: { userId: 'user-1', profile: null, isAdmin: false } as {
    userId: string | null;
    profile: null;
    isAdmin: boolean;
  },
}));

vi.mock('convex/react', () => ({
  useConvex: () => undefined,
  useQuery: (_query: unknown, args: Record<string, unknown>) =>
    'groupId' in args ? mocks.memberships.get(args.groupId as string | null) : mocks.session,
}));

import { assetSubjectFacts } from '@shared/access/collaborativeAccess';
import { renderHook } from '@testing-library/react';

import { useAssetAccess } from './viewerAccess';

const groupA = { id: 'group-a', name: 'Sietch Tabr', slug: 'sietch-tabr' };
const groupB = { id: 'group-b', name: 'Fremen Council', slug: 'fremen-council' };

function subjectIn(group: typeof groupA | null, ownerId = 'user-1') {
  // oxlint-disable-next-line typescript/no-explicit-any -- the hook only reads ids, which are strings in the browser
  return assetSubjectFacts('asset', { owner_id: ownerId, is_deleted: false }, group as any);
}

beforeEach(() => {
  mocks.memberships = new Map([
    [null, 'none'],
    ['group-a', 'active'],
  ]);
  mocks.session = { userId: 'user-1', profile: null, isAdmin: false };
});

describe('useAssetAccess', () => {
  test('stays resolved while the membership of a newly assigned Group loads, so an open editor keeps its draft', () => {
    const { result, rerender } = renderHook(({ group }) => useAssetAccess(subjectIn(group)), {
      initialProps: { group: groupA as typeof groupA | null },
    });
    expect(result.current.resolved).toBe(true);
    expect(result.current.viewerAccess.capabilities.edit).toBe(true);

    /* The owner moves the asset to a Group whose membership has not been asked for yet: Convex answers undefined. */
    rerender({ group: groupB });
    expect(result.current.resolved).toBe(true);
    expect(result.current.viewerAccess.capabilities.edit).toBe(true);

    mocks.memberships.set('group-b', 'active');
    rerender({ group: groupB });
    expect(result.current.resolved).toBe(true);
  });

  test('is unresolved before the first membership answer, and never carries one user over to another', () => {
    mocks.memberships.delete('group-a');
    const { result, rerender } = renderHook(() => useAssetAccess(subjectIn(groupA, 'user-2')));
    expect(result.current.resolved).toBe(false);
    expect(result.current.viewerAccess.capabilities.edit).toBe(false);

    mocks.memberships.set('group-a', 'active');
    rerender();
    expect(result.current.resolved).toBe(true);
    expect(result.current.viewerAccess.capabilities.edit).toBe(true);

    /* A different user signs in and their membership is still loading: nothing is borrowed from the previous one. */
    mocks.session = { userId: 'user-3', profile: null, isAdmin: false };
    mocks.memberships.delete('group-a');
    rerender();
    expect(result.current.resolved).toBe(false);
    expect(result.current.viewerAccess.capabilities.edit).toBe(false);
  });
});
