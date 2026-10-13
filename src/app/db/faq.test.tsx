// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { getFunctionName } from 'convex/server';
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

import { useAskFaqQuestion, useFaqQuestionPage } from './faq';

const serverPage = {
  ruleset: { id: 'ruleset-1', slug: 'test-ruleset', name: 'TestRuleset' },
  question: {
    id: 'question-1',
    slug: '1',
    text: 'How does loader handoff work?',
    tags: ['rules'] as const,
    author: null,
    askedBy: 'asker',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
  answers: [
    {
      id: 'answer-2',
      text: 'The accepted answer.',
      author: null,
      answeredBy: 'answerer',
      createdAt: '2026-08-05T00:02:00.000Z',
      accepted: true,
    },
  ],
};

/** Answers the page, the session and the viewer's answered flag by function name, as Convex would for each subscription. */
function serveQueries(viewer: { userId: string | null; answered: boolean | undefined }) {
  mocks.useQuery.mockImplementation((reference) => {
    switch (getFunctionName(reference)) {
      case getFunctionName(api.profiles.session):
        return { userId: viewer.userId, profile: null, isAdmin: false };
      case getFunctionName(api.faq.viewerAnswered):
        return viewer.answered;
      default:
        return serverPage;
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
  const mutationsByReference = new Map([
    [getFunctionName(api.faq.editQuestion), mocks.editQuestion],
    [getFunctionName(api.faq.deleteQuestion), mocks.deleteQuestion],
    [getFunctionName(api.faq.createAnswer), mocks.createAnswer],
    [getFunctionName(api.faq.editAnswer), mocks.editAnswer],
    [getFunctionName(api.faq.deleteAnswer), mocks.deleteAnswer],
    [getFunctionName(api.faq.setAcceptedAnswer), mocks.setAcceptedAnswer],
    [getFunctionName(api.faq.createQuestion), mocks.askQuestion],
  ]);
  mocks.useMutation.mockImplementation((mutationReference) => {
    const functionName = getFunctionName(mutationReference);
    const mutation = mutationsByReference.get(functionName);
    if (!mutation) {
      throw new Error(`Unexpected FAQ mutation reference: ${functionName}`);
    }
    return mutation;
  });
});

describe('FAQ question page interface', () => {
  test('combines the shared page with the viewer once both halves settle', () => {
    serveQueries({ userId: 'answerer', answered: undefined });
    const hook = renderHook(() => useFaqQuestionPage({ rulesetSlug: 'test-ruleset', questionSlug: '1' }));
    expect(hook.result.current.page).toMatchObject({ viewerResolved: false, viewer: { answerQuestion: false } });
    expect(hook.result.current.page?.answers[0]?.capabilities.editAnswer).toBe(false);

    serveQueries({ userId: 'answerer', answered: true });
    hook.rerender();
    expect(hook.result.current.page).toMatchObject({ viewerResolved: true, viewer: { answerQuestion: false } });
    expect(hook.result.current.page?.answers[0]?.capabilities).toEqual({
      editAnswer: true,
      deleteAnswer: true,
      acceptAnswer: false,
      unacceptAnswer: false,
    });

    serveQueries({ userId: 'asker', answered: false });
    hook.rerender();
    expect(hook.result.current.page?.question.capabilities).toEqual({ editQuestion: true, deleteQuestion: true });
    expect(hook.result.current.page?.answers[0]?.capabilities).toMatchObject({
      unacceptAnswer: true,
      editAnswer: false,
    });
    expect(hook.result.current.page?.viewer.answerQuestion).toBe(true);
  });

  test('keeps the combined question and answers referentially stable while their inputs are unchanged', () => {
    serveQueries({ userId: 'asker', answered: false });
    const hook = renderHook(() => useFaqQuestionPage({ rulesetSlug: 'test-ruleset', questionSlug: '1' }));
    const first = hook.result.current.page;

    /* The question route re-runs its hash scroll whenever these change identity, so an unrelated rerender must not change them. */
    hook.rerender();
    expect(hook.result.current.page).toBe(first);
    expect(hook.result.current.page?.question).toBe(first?.question);
    expect(hook.result.current.page?.answers).toBe(first?.answers);

    serveQueries({ userId: 'asker', answered: true });
    hook.rerender();
    expect(hook.result.current.page?.answers).not.toBe(first?.answers);
  });

  test('binds domain commands to the loaded question and canonical operations', async () => {
    serveQueries({ userId: 'asker', answered: false });
    const hook = renderHook(() => useFaqQuestionPage({ rulesetSlug: 'test-ruleset', questionSlug: '1' }));

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

  test('keeps pending and error state isolated between commands', async () => {
    serveQueries({ userId: 'asker', answered: false });
    const pendingEdit = deferred<null>();
    const deleteError = new Error('Delete failed');
    mocks.editQuestion.mockReturnValueOnce(pendingEdit.promise);
    mocks.deleteQuestion.mockRejectedValueOnce(deleteError);
    const hook = renderHook(() => useFaqQuestionPage({ rulesetSlug: 'test-ruleset', questionSlug: '1' }));

    let editPromise!: Promise<void>;
    act(() => {
      editPromise = hook.result.current.editQuestion.run({
        question: 'Edited question?',
        tags: ['errata'],
      });
    });

    await waitFor(() => expect(hook.result.current.editQuestion.isPending).toBe(true));
    expect(hook.result.current.deleteQuestion).toMatchObject({
      isPending: false,
      isError: false,
      error: null,
    });

    await act(async () => {
      await expect(hook.result.current.deleteQuestion.run()).rejects.toThrow('Delete failed');
    });

    expect(hook.result.current.editQuestion).toMatchObject({
      isPending: true,
      isError: false,
      error: null,
    });
    expect(hook.result.current.deleteQuestion).toMatchObject({
      isPending: false,
      isError: true,
      error: deleteError,
    });

    act(() => hook.result.current.deleteQuestion.reset());
    expect(hook.result.current.deleteQuestion).toMatchObject({
      isPending: false,
      isError: false,
      error: null,
    });
    expect(hook.result.current.editQuestion).toMatchObject({
      isPending: true,
      isError: false,
      error: null,
    });

    await act(async () => {
      pendingEdit.resolve(null);
      await editPromise;
    });

    expect(hook.result.current.editQuestion).toMatchObject({
      isPending: false,
      isError: false,
      error: null,
    });
    expect(hook.result.current.deleteQuestion).toMatchObject({
      isPending: false,
      isError: false,
      error: null,
    });
  });

  test('asks a question through the canonical operation and returns its locator', async () => {
    mocks.askQuestion.mockResolvedValue({
      questionId: 'question-2',
      rulesetSlug: 'test-ruleset',
      questionSlug: '2',
    });
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
