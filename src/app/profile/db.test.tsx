// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery, mutation: vi.fn() } }));
vi.mock('convex/react', () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
}));

import { loadProfileBySlug } from './db';

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
  factions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
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
