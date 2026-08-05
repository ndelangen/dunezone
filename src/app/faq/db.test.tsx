// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from '../../../convex/_generated/api';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  editQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  createAnswer: vi.fn(),
  editAnswer: vi.fn(),
  deleteAnswer: vi.fn(),
  setAcceptedAnswer: vi.fn(),
  askQuestion: vi.fn(),
}));

vi.mock('@db/core', () => ({ db: { query: mocks.dbQuery } }));
vi.mock('convex/react', () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
}));

import { loadFaqQuestionPage, useAskFaqQuestion, useFaqQuestionPage } from './db';

const serverPage = {
  ruleset: { id: 'ruleset-1', slug: 'test-ruleset', name: 'TestRuleset' },
  question: {
    id: 'question-1',
    slug: '1',
    text: 'How does loader handoff work?',
    tags: ['rules'] as const,
    author: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    capabilities: { editQuestion: true, deleteQuestion: true },
  },
  viewer: { answerQuestion: false },
  answers: [
    {
      id: 'answer-2',
      text: 'The accepted answer.',
      author: null,
      createdAt: '2026-08-05T00:02:00.000Z',
      accepted: true,
      capabilities: {
        editAnswer: false,
        deleteAnswer: true,
        acceptAnswer: false,
        unacceptAnswer: true,
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const mutation of [
    mocks.editQuestion,
    mocks.deleteQuestion,
    mocks.createAnswer,
    mocks.editAnswer,
    mocks.deleteAnswer,
    mocks.setAcceptedAnswer,
  ]) {
    mutation.mockResolvedValue(null);
  }
  const mutations = [
    mocks.editQuestion,
    mocks.deleteQuestion,
    mocks.createAnswer,
    mocks.editAnswer,
    mocks.deleteAnswer,
    mocks.setAcceptedAnswer,
  ];
  mocks.useMutation.mockImplementation(
    () => mutations[(mocks.useMutation.mock.calls.length - 1) % mutations.length]
  );
});

describe('FAQ question page interface', () => {
  test('uses the same canonical page for loader handoff and live data', async () => {
    mocks.dbQuery.mockResolvedValue(serverPage);
    const loaded = await loadFaqQuestionPage({
      rulesetSlug: 'test-ruleset',
      questionSlug: '1',
    });

    expect(loaded).toEqual(serverPage);
    expect(mocks.dbQuery).toHaveBeenCalledWith(api.faq.questionPage, {
      rulesetSlug: 'test-ruleset',
      questionSlug: '1',
    });

    mocks.useQuery.mockReturnValue(undefined);
    const loaderHandoff = renderHook(() =>
      useFaqQuestionPage(
        { rulesetSlug: 'test-ruleset', questionSlug: '1' },
        { initialPage: loaded }
      )
    );
    expect(loaderHandoff.result.current.page).toEqual(serverPage);
    loaderHandoff.unmount();

    mocks.useQuery.mockReturnValue(serverPage);
    const live = renderHook(() =>
      useFaqQuestionPage({ rulesetSlug: 'test-ruleset', questionSlug: '1' })
    );
    expect(live.result.current.page).toEqual(serverPage);
    expect(mocks.useQuery).toHaveBeenLastCalledWith(api.faq.questionPage, {
      rulesetSlug: 'test-ruleset',
      questionSlug: '1',
    });
    live.unmount();
  });

  test('binds domain commands to the loaded question and canonical operations', async () => {
    mocks.useQuery.mockReturnValue(serverPage);
    const hook = renderHook(() =>
      useFaqQuestionPage({ rulesetSlug: 'test-ruleset', questionSlug: '1' })
    );

    await act(() =>
      hook.result.current.editQuestion.run({
        question: 'Edited question?',
        tags: ['errata'],
      })
    );
    await act(() => hook.result.current.deleteQuestion.run());
    await act(() => hook.result.current.createAnswer.run({ answer: 'New answer.' }));
    await act(() =>
      hook.result.current.editAnswer.run({
        answerId: 'answer-2',
        answer: 'Edited answer.',
      })
    );
    await act(() => hook.result.current.deleteAnswer.run({ answerId: 'answer-2' }));
    await act(() => hook.result.current.setAcceptedAnswer.run({ answerId: 'answer-2' }));

    expect(mocks.editQuestion).toHaveBeenCalledWith({
      questionId: 'question-1',
      input: { question: 'Edited question?', tags: ['errata'] },
    });
    expect(mocks.deleteQuestion).toHaveBeenCalledWith({ questionId: 'question-1' });
    expect(mocks.createAnswer).toHaveBeenCalledWith({
      faq_item_id: 'question-1',
      answer: 'New answer.',
    });
    expect(mocks.editAnswer).toHaveBeenCalledWith({
      answerId: 'answer-2',
      input: { answer: 'Edited answer.' },
    });
    expect(mocks.deleteAnswer).toHaveBeenCalledWith({ id: 'answer-2' });
    expect(mocks.setAcceptedAnswer).toHaveBeenCalledWith({
      faq_item_id: 'question-1',
      accepted_answer_id: 'answer-2',
    });
  });

  test('asks a question through the canonical operation and returns its locator', async () => {
    mocks.askQuestion.mockResolvedValue({
      questionId: 'question-2',
      rulesetSlug: 'test-ruleset',
      questionSlug: '2',
    });
    mocks.useMutation.mockReturnValue(mocks.askQuestion);
    const hook = renderHook(() => useAskFaqQuestion());

    let locator: { rulesetSlug: string; questionSlug: string } | undefined;
    await act(async () => {
      locator = await hook.result.current.run({
        rulesetId: 'ruleset-1',
        question: 'A new question?',
        initialAnswer: 'An initial answer.',
        tags: ['rules'],
      });
    });

    expect(mocks.askQuestion).toHaveBeenCalledWith({
      rulesetId: 'ruleset-1',
      question: 'A new question?',
      initialAnswer: 'An initial answer.',
      tags: ['rules'],
    });
    expect(locator).toEqual({
      rulesetSlug: 'test-ruleset',
      questionSlug: '2',
    });
  });
});
