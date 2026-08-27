import type { FaqTag } from '@shared/faq/tags';
import { faqAnswerSchema, faqQuestionSchema, faqTagsSchema } from '@shared/faq/validation';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import type { LiveMutationResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

type FaqItemRow = Doc<'faq_items'>;
type FaqAnswerRow = Doc<'faq_answers'>;
type FaqItemEntry = FaqItemRow;
export type FaqAnswerEntry = FaqAnswerRow;

export type FaqItemWithDetails = FaqItemEntry & {
  faq_answers: FaqAnswerEntry[];
  asker_profile: ProfileSummary | null;
};

export type FaqQuestionLocator = {
  rulesetSlug: string;
  questionSlug: string;
};

export type FaqQuestionPage = FunctionReturnType<typeof api.faq.questionPage>;

type CommandState = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
};

export type FaqCommand<TVariables> = CommandState & {
  run: (variables: TVariables) => Promise<void>;
};

export type FaqVoidCommand = CommandState & {
  run: () => Promise<void>;
};

function commandState<TVariables, TResult>(mutation: LiveMutationResult<TVariables, TResult>): CommandState {
  return {
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}

function command<TInput, TVariables, TResult>(
  mutation: LiveMutationResult<TVariables, TResult>,
  variables: (input: TInput) => TVariables
): FaqCommand<TInput> {
  return {
    run: async (input) => {
      await mutation.mutateAsync(variables(input));
    },
    ...commandState(mutation),
  };
}

function voidCommand<TVariables, TResult>(
  mutation: LiveMutationResult<TVariables, TResult>,
  variables: () => TVariables
): FaqVoidCommand {
  return {
    run: async () => {
      await mutation.mutateAsync(variables());
    },
    ...commandState(mutation),
  };
}

export async function loadFaqQuestionPage(locator: FaqQuestionLocator): Promise<FaqQuestionPage> {
  return await db.query(api.faq.questionPage, locator);
}

export function useFaqQuestionPage(locator: FaqQuestionLocator, options?: { initialPage?: FaqQuestionPage }) {
  const livePage = useQuery(api.faq.questionPage, locator);
  const query = toLiveQueryResult(livePage, () => options?.initialPage);
  const questionId = query.data?.question.id;

  const editQuestionMutation = useLiveMutation<
    { questionId: string; input: { question: string; tags: FaqTag[] } },
    unknown
  >(api.faq.editQuestion);
  const deleteQuestionMutation = useLiveMutation<{ questionId: string }, unknown>(api.faq.deleteQuestion);
  const createAnswerMutation = useLiveMutation<{ faq_item_id: string; answer: string }, unknown>(api.faq.createAnswer);
  const editAnswerMutation = useLiveMutation<{ answerId: string; input: { answer: string } }, unknown>(
    api.faq.editAnswer
  );
  const deleteAnswerMutation = useLiveMutation<{ id: string }, unknown>(api.faq.deleteAnswer);
  const setAcceptedAnswerMutation = useLiveMutation<
    { faq_item_id: string; accepted_answer_id: string | null },
    unknown
  >(api.faq.setAcceptedAnswer);

  const requireQuestionId = () => {
    if (!questionId) {
      throw new Error('FAQ question is not loaded');
    }
    return questionId;
  };

  return {
    ...query,
    page: query.data,
    editQuestion: command(editQuestionMutation, (input: { question: string; tags: FaqTag[] }) => ({
      questionId: requireQuestionId(),
      input: {
        question: faqQuestionSchema.parse(input.question),
        tags: faqTagsSchema.parse(input.tags),
      },
    })),
    deleteQuestion: voidCommand(deleteQuestionMutation, () => ({
      questionId: requireQuestionId(),
    })),
    createAnswer: command(createAnswerMutation, (input: { answer: string }) => ({
      faq_item_id: requireQuestionId(),
      answer: faqAnswerSchema.parse(input.answer),
    })),
    editAnswer: command(editAnswerMutation, (input: { answerId: string; answer: string }) => ({
      answerId: input.answerId,
      input: { answer: faqAnswerSchema.parse(input.answer) },
    })),
    deleteAnswer: command(deleteAnswerMutation, (input: { answerId: string }) => ({
      id: input.answerId,
    })),
    setAcceptedAnswer: command(setAcceptedAnswerMutation, (input: { answerId: string | null }) => ({
      faq_item_id: requireQuestionId(),
      accepted_answer_id: input.answerId,
    })),
  };
}

export type AskFaqQuestionInput = {
  rulesetId: string;
  question: string;
  initialAnswer?: string;
  tags: FaqTag[];
};

export function useAskFaqQuestion() {
  const mutation = useLiveMutation<
    { rulesetId: string; question: string; initialAnswer?: string; tags: FaqTag[] },
    FaqQuestionLocator
  >(api.faq.createQuestion);
  const toVariables = (input: AskFaqQuestionInput) => ({
    rulesetId: input.rulesetId,
    question: faqQuestionSchema.parse(input.question),
    initialAnswer:
      input.initialAnswer === undefined || input.initialAnswer.trim().length === 0
        ? undefined
        : faqAnswerSchema.parse(input.initialAnswer),
    tags: faqTagsSchema.parse(input.tags),
  });
  return {
    ...commandState(mutation),
    run: async (input: AskFaqQuestionInput): Promise<FaqQuestionLocator> => {
      const locator = await mutation.mutateAsync(toVariables(input));
      return {
        rulesetSlug: locator.rulesetSlug,
        questionSlug: locator.questionSlug,
      };
    },
  };
}
