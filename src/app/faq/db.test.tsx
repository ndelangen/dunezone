// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../../../convex/_generated/api';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock('@db/core', () => ({
  db: { query: mocks.dbQuery },
}));

vi.mock('convex/react', () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
}));

import {
  faqItemByRulesetSlugInitialData,
  loadFaqItemByRulesetAndSlug,
  useFaqItemByRulesetAndSlug,
} from './db';

const serverPage = {
  _id: 'question-1',
  _creationTime: 1,
  ruleset_id: 'ruleset-1',
  slug: '1',
  question: 'How does loader handoff work?',
  tags: ['rules'],
  asked_by: 'owner-1',
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
  accepted_answer_id: 'answer-2',
  ruleset: { id: 'ruleset-1', slug: 'test-ruleset', name: 'TestRuleset' },
  asker_profile: null,
  faq_answers: [
    {
      _id: 'answer-1',
      _creationTime: 2,
      faq_item_id: 'question-1',
      answer: 'The first answer.',
      answered_by: 'answerer-1',
      created_at: '2026-08-05T00:01:00.000Z',
      answerer_profile: null,
    },
    {
      _id: 'answer-2',
      _creationTime: 3,
      faq_item_id: 'question-1',
      answer: 'The accepted answer.',
      answered_by: 'answerer-2',
      created_at: '2026-08-05T00:02:00.000Z',
      answerer_profile: null,
    },
  ],
};

const expectedPage = {
  ...serverPage,
  id: 'question-1',
  faq_answers: [
    { ...serverPage.faq_answers[0], id: 'answer-1' },
    { ...serverPage.faq_answers[1], id: 'answer-2' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FAQ detail loader and live projection', () => {
  test('produces the same page after loader handoff and a live query result', async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);
    const loaded = await loadFaqItemByRulesetAndSlug('test-ruleset', '1');
    const initialData = faqItemByRulesetSlugInitialData(loaded);

    expect(mocks.dbQuery).toHaveBeenCalledWith(api.faq.detailByRulesetSlugAndQuestionSlug, {
      ruleset_slug: 'test-ruleset',
      question_slug: '1',
    });
    mocks.useQuery.mockReturnValue(undefined);
    const loaderHandoff = renderHook(() =>
      useFaqItemByRulesetAndSlug('test-ruleset', '1', { initialData })
    );
    expect(loaderHandoff.result.current.data).toEqual(expectedPage);
    loaderHandoff.unmount();

    mocks.useQuery.mockReturnValue(serverPage);
    const live = renderHook(() => useFaqItemByRulesetAndSlug('test-ruleset', '1'));
    expect(live.result.current.data).toEqual(expectedPage);
    expect(mocks.useQuery).toHaveBeenLastCalledWith(api.faq.detailByRulesetSlugAndQuestionSlug, {
      ruleset_slug: 'test-ruleset',
      question_slug: '1',
    });
    live.unmount();
  });
});
