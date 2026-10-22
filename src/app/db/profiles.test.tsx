// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery, mutation: vi.fn() } }));
vi.mock('convex/react', () => ({
  useConvex: () => undefined,
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
}));

import { renderHook } from '@testing-library/react';

import { loadProfileBySlug, useSessionViewer } from './profiles';

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
  groupSummaries,
  factionPreview: [],
  factionCount: 0,
  answerPreview: [],
  answerCount: 7,
  pickedAnswerCount: 2,
  questionPreview: [],
  questionCount: 31,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('profile page interface', () => {
  test("carries the server's counts through, so the page reads whole lists rather than the slice it shows", async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);

    const loaded = await loadProfileBySlug('chani');

    expect(loaded.answerCount).toBe(7);
    expect(loaded.pickedAnswerCount).toBe(2);
    expect(loaded.questionCount).toBe(31);
    expect(loaded.factionPreview).toEqual([]);
  });

  test('raises not found for a slug no public profile answers to', async () => {
    mocks.dbQuery.mockResolvedValue(null);

    await expect(loadProfileBySlug('nobody')).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
  });
});

describe('the session tri-state', () => {
  test('an unanswered session reads as pending, never as either settled state', () => {
    mocks.useQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useSessionViewer());

    expect(result.current).toEqual({ kind: 'pending' });
  });

  test('a session that answers null reads as settled signed-out, not as pending', () => {
    mocks.useQuery.mockReturnValue({ userId: null, profile: null });

    const { result } = renderHook(() => useSessionViewer());

    expect(result.current).toEqual({ kind: 'signed-out' });
  });

  test('a session with a profile hands that profile and its Administrator flag through', () => {
    mocks.useQuery.mockReturnValue({ userId: 'user-1', profile, isAdmin: true });

    const { result } = renderHook(() => useSessionViewer());

    expect(result.current).toEqual({ kind: 'profile', profile, isAdmin: true });
  });
});
