// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery, mutation: vi.fn() } }));
vi.mock('convex/react', () => ({
  useConvexAuth: mocks.useAuth,
  useConvex: () => undefined,
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
}));

import { renderHook } from '@testing-library/react';

import { loadProfileBySlug, useAccountBanState, useSessionViewer } from './profiles';

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
  faqAsked: [],
  faqAnswers: [],
  faqLists: { asked: { items: [], page: 1, pageCount: 1 }, answered: { items: [], page: 1, pageCount: 1 } },
  factionPreview: [],
  factionCount: 0,
  listedFactionCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
});

describe('profile page interface', () => {
  test('counts only answers whose parent question accepted them', async () => {
    const acceptedAnswer = {
      _id: 'answer-1',
      answer: 'Accepted',
      faq_item: { id: 'faq-1', accepted_answer_id: 'answer-1' },
    };
    const otherAnswer = {
      _id: 'answer-2',
      answer: 'Not accepted',
      faq_item: { id: 'faq-2', accepted_answer_id: null },
    };
    const supersededAnswer = {
      _id: 'answer-3',
      answer: 'Another answer was accepted instead',
      faq_item: { id: 'faq-3', accepted_answer_id: 'answer-9' },
    };
    mocks.dbQuery.mockResolvedValue({
      ...serverPage,
      faqAnswers: [acceptedAnswer, otherAnswer, supersededAnswer],
    });

    const loaded = await loadProfileBySlug('chani');

    expect(loaded.acceptedAnswerCount).toBe(1);
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

describe('account access at the root', () => {
  test('waits for the signed-in account before rendering any route', () => {
    mocks.useQuery.mockReturnValue(undefined);
    const { result } = renderHook(() => useAccountBanState());
    expect(result.current).toEqual({ pending: true, banned: false });
  });

  test('a live ban tells the root to replace access', () => {
    mocks.useQuery.mockReturnValue({ userId: 'user-1', profile, isAdmin: false, isBanned: false });
    const { result, rerender } = renderHook(() => useAccountBanState());
    expect(result.current).toEqual({ pending: false, banned: false });
    mocks.useQuery.mockReturnValue({ userId: null, profile: null, isAdmin: false, isBanned: true });
    rerender();
    expect(result.current).toEqual({ pending: false, banned: true });
  });

  test('an anonymous browser does not wait for a profile query', () => {
    mocks.useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    mocks.useQuery.mockReturnValue(undefined);
    const { result } = renderHook(() => useAccountBanState());
    expect(result.current).toEqual({ pending: false, banned: false });
  });
});
