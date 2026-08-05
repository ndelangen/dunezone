import { useQuery } from 'convex/react';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import type { FaqTag } from '@app/faq/tags';
import { faqAnswerSchema, faqQuestionSchema, faqTagsSchema } from '@app/faq/validation';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type FaqItemRow = Doc<'faq_items'>;
export type FaqAnswerRow = Doc<'faq_answers'>;
export type FaqItemEntry = FaqItemRow;
export type FaqItemInsert = FaqItemRow;
export type FaqItemUpdate = Partial<FaqItemRow>;
export type FaqAnswerEntry = FaqAnswerRow;
export type FaqAnswerInsert = FaqAnswerRow;
export type FaqAnswerUpdate = Partial<FaqAnswerRow>;

export type FaqItemWithDetails = FaqItemEntry & {
  faq_answers: FaqAnswerEntry[];
  asker_profile: {
    id: string;
    slug: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

export async function loadFaqItemsByRuleset(rulesetId: string): Promise<FaqItemWithDetails[]> {
  const items = await db.query<FaqItemWithDetails[]>(api.faq.byRuleset, {
    ruleset_id: rulesetId,
  });
  return items;
}

export async function loadFaqItemDetail(
  id: string
): Promise<FaqItemEntry & { faq_answers: FaqAnswerEntry[] }> {
  return await db.query<FaqItemEntry & { faq_answers: FaqAnswerEntry[] }>(api.faq.detail, { id });
}

export async function loadFaqItemByRulesetAndSlug(
  rulesetSlug: string,
  questionSlug: string
): Promise<
  Omit<FaqItemEntry, 'faq_answers'> & {
    asker_profile: {
      id: string;
      slug: string;
      username: string | null;
      avatar_url: string | null;
    } | null;
    ruleset: { id: string; slug: string; name: string };
    faq_answers: (FaqAnswerEntry & {
      answerer_profile: {
        id: string;
        slug: string;
        username: string | null;
        avatar_url: string | null;
      } | null;
    })[];
  }
> {
  const item = await db.query<
    Omit<FaqItemEntry, 'faq_answers'> & {
      asker_profile: {
        id: string;
        slug: string;
        username: string | null;
        avatar_url: string | null;
      } | null;
      ruleset: { id: string; slug: string; name: string };
      faq_answers: (FaqAnswerEntry & {
        answerer_profile: {
          id: string;
          slug: string;
          username: string | null;
          avatar_url: string | null;
        } | null;
      })[];
    }
  >(api.faq.detailByRulesetSlugAndQuestionSlug, {
    ruleset_slug: rulesetSlug,
    question_slug: questionSlug,
  });
  return item;
}

export function useFaqItemsByRuleset(
  rulesetId: string,
  options?: { initialData?: FaqItemWithDetails[] }
) {
  const liveData = useQuery(api.faq.byRuleset, { ruleset_id: rulesetId } as never) as
    | (Omit<FaqItemWithDetails, 'id' | 'faq_answers'> & {
        faq_answers: Omit<FaqAnswerEntry, 'id'>[];
      })[]
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map((item) => ({
      ...item,
      id: item._id,
      faq_answers: item.faq_answers.map((answer) => ({ ...answer, id: answer._id })),
    })),
  };
}

export function useFaqItem(id: string) {
  const liveData = useQuery(api.faq.detail, { id } as never) as
    | (Omit<FaqItemEntry, 'id'> & { faq_answers: Omit<FaqAnswerEntry, 'id'>[] })
    | undefined;
  const result = toLiveQueryResult(liveData, true);
  return {
    ...result,
    data: result.data
      ? {
          ...result.data,
          id: result.data._id,
          faq_answers: result.data.faq_answers.map((answer) => ({ ...answer, id: answer._id })),
        }
      : undefined,
  };
}

export function useFaqItemByRulesetAndSlug(
  rulesetSlug: string,
  questionSlug: string,
  options?: {
    initialData?: Omit<FaqItemEntry, 'id' | 'faq_answers'> & {
      id: FaqItemRow['_id'];
      asker_profile: {
        id: string;
        slug: string;
        username: string | null;
        avatar_url: string | null;
      } | null;
      ruleset: { id: string; slug: string; name: string };
      faq_answers: (Omit<FaqAnswerEntry, 'id'> & {
        id: FaqAnswerRow['_id'];
        answerer_profile: {
          id: string;
          slug: string;
          username: string | null;
          avatar_url: string | null;
        } | null;
      })[];
    };
  }
) {
  const liveData = useQuery(api.faq.detailByRulesetSlugAndQuestionSlug, {
    ruleset_slug: rulesetSlug,
    question_slug: questionSlug,
  } as never) as
    | (Omit<FaqItemEntry, 'id' | 'faq_answers'> & {
        asker_profile: {
          id: string;
          slug: string;
          username: string | null;
          avatar_url: string | null;
        } | null;
        ruleset: { id: string; slug: string; name: string };
        faq_answers: (Omit<FaqAnswerEntry, 'id'> & {
          answerer_profile: {
            id: string;
            slug: string;
            username: string | null;
            avatar_url: string | null;
          } | null;
        })[];
      })
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data
      ? {
          ...result.data,
          id: result.data._id,
          ruleset: { ...result.data.ruleset, id: result.data.ruleset.id },
          faq_answers: result.data.faq_answers.map((answer) => ({ ...answer, id: answer._id })),
        }
      : undefined,
  };
}

/** `initialData` shape for `useFaqItemByRulesetAndSlug` (Convex `_id` + mapped `id`). */
export type FaqItemByRulesetSlugInitialData = NonNullable<
  NonNullable<Parameters<typeof useFaqItemByRulesetAndSlug>[2]>['initialData']
>;

export function faqItemByRulesetSlugInitialData(
  item: Awaited<ReturnType<typeof loadFaqItemByRulesetAndSlug>>
): FaqItemByRulesetSlugInitialData {
  return {
    ...item,
    id: item._id,
    faq_answers: item.faq_answers.map((answer) => ({
      ...answer,
      id: answer._id,
    })),
  };
}

export type FaqItemAskedByWithRuleset = FaqItemEntry & {
  ruleset: { id: string; name: string; slug: string };
};

export async function loadFaqItemsAskedBy(profileId: string): Promise<FaqItemAskedByWithRuleset[]> {
  const entries = await db.query<FaqItemAskedByWithRuleset[]>(api.faq.askedBy, {
    profile_id: profileId,
  });
  return entries;
}

export type FaqAnswerWithParent = FaqAnswerEntry & {
  faq_item: {
    id: FaqItemRow['_id'];
    slug: string;
    question: string;
    ruleset_id: string;
    asked_by: string;
    accepted_answer_id: string | null;
  };
  asker_profile: {
    id: string;
    slug: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  ruleset: { id: string; name: string; slug: string };
};

export async function loadFaqAnswersByUser(profileId: string): Promise<FaqAnswerWithParent[]> {
  const answers = await db.query<FaqAnswerWithParent[]>(api.faq.answeredBy, {
    profile_id: profileId,
  });
  return answers;
}

export function useFaqItemsAskedBy(
  profileId: string,
  options?: { initialData?: FaqItemAskedByWithRuleset[] }
) {
  const liveData = useQuery(api.faq.askedBy, { profile_id: profileId } as never) as
    | FaqItemAskedByWithRuleset[]
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data,
  };
}

export function useFaqAnswersByUser(
  profileId: string,
  options?: { initialData?: FaqAnswerWithParent[] }
) {
  const liveData = useQuery(api.faq.answeredBy, { profile_id: profileId } as never) as
    | FaqAnswerWithParent[]
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data,
  };
}

export function useCreateFaqItem() {
  const mutation = useLiveMutation<
    { ruleset_id: string; question: string; answer?: string; tags: FaqTag[] },
    Omit<FaqItemEntry, 'id'>
  >(api.faq.createItem);
  return {
    ...mutation,
    mutate: (
      variables: { rulesetId: string; question: string; answer?: string; tags: FaqTag[] },
      options?: { onSuccess?: (entry: FaqItemEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        {
          ruleset_id: variables.rulesetId,
          question: faqQuestionSchema.parse(variables.question),
          answer:
            variables.answer === undefined || variables.answer.trim().length === 0
              ? undefined
              : faqAnswerSchema.parse(variables.answer),
          tags: faqTagsSchema.parse(variables.tags),
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({
      rulesetId,
      question,
      answer,
      tags,
    }: {
      rulesetId: string;
      question: string;
      answer?: string;
      tags: FaqTag[];
    }) => {
      const entry = await mutation.mutateAsync({
        ruleset_id: rulesetId,
        question: faqQuestionSchema.parse(question),
        answer:
          answer === undefined || answer.trim().length === 0
            ? undefined
            : faqAnswerSchema.parse(answer),
        tags: faqTagsSchema.parse(tags),
      });
      return entry;
    },
  };
}

export function useUpdateFaqItem() {
  const mutation = useLiveMutation<
    { id: string; question?: string; tags?: FaqTag[]; accepted_answer_id?: string | null },
    Omit<FaqItemEntry, 'id'>
  >(api.faq.updateItem);
  return {
    ...mutation,
    mutate: (
      variables: { id: string; input: Partial<FaqItemUpdate> },
      options?: { onSuccess?: (entry: FaqItemEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        {
          id: variables.id,
          question:
            variables.input.question !== undefined
              ? faqQuestionSchema.parse(variables.input.question)
              : undefined,
          tags:
            variables.input.tags !== undefined
              ? faqTagsSchema.parse(variables.input.tags)
              : undefined,
          accepted_answer_id: variables.input.accepted_answer_id,
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ id, input }: { id: string; input: Partial<FaqItemUpdate> }) => {
      const entry = await mutation.mutateAsync({
        id,
        question:
          input.question !== undefined ? faqQuestionSchema.parse(input.question) : undefined,
        tags: input.tags !== undefined ? faqTagsSchema.parse(input.tags) : undefined,
        accepted_answer_id: input.accepted_answer_id,
      });
      return entry;
    },
  };
}

export function useSetAcceptedAnswer() {
  const mutation = useLiveMutation<
    { faq_item_id: string; accepted_answer_id: string | null },
    Omit<FaqItemEntry, 'id'>
  >(api.faq.setAcceptedAnswer);
  return {
    ...mutation,
    mutate: (
      variables: { faqItemId: string; acceptedAnswerId: string | null },
      options?: { onSuccess?: (entry: FaqItemEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { faq_item_id: variables.faqItemId, accepted_answer_id: variables.acceptedAnswerId },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({
      faqItemId,
      acceptedAnswerId,
    }: {
      faqItemId: string;
      acceptedAnswerId: string | null;
    }) => {
      const entry = await mutation.mutateAsync({
        faq_item_id: faqItemId,
        accepted_answer_id: acceptedAnswerId,
      });
      return entry;
    },
  };
}

export function useDeleteFaqItem() {
  const mutation = useLiveMutation<
    { id: string },
    { id: string; rulesetId?: string; askedBy?: string }
  >(api.faq.deleteItem);
  return {
    ...mutation,
    mutate: (
      id: string,
      options?: {
        onSuccess?: (entry: { id: string; rulesetId?: string; askedBy?: string }) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        { id },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (id: string) => await mutation.mutateAsync({ id }),
  };
}

export function useCreateFaqAnswer() {
  const mutation = useLiveMutation<
    { faq_item_id: string; answer: string },
    Omit<FaqAnswerEntry, 'id'>
  >(api.faq.createAnswer);
  return {
    ...mutation,
    mutate: (
      variables: { faqItemId: string; answer: string },
      options?: { onSuccess?: (entry: FaqAnswerEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        {
          faq_item_id: variables.faqItemId,
          answer: faqAnswerSchema.parse(variables.answer),
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ faqItemId, answer }: { faqItemId: string; answer: string }) => {
      const entry = await mutation.mutateAsync({
        faq_item_id: faqItemId,
        answer: faqAnswerSchema.parse(answer),
      });
      return entry;
    },
  };
}

export function useUpdateFaqAnswer() {
  const mutation = useLiveMutation<{ id: string; answer: string }, Omit<FaqAnswerEntry, 'id'>>(
    api.faq.updateAnswer
  );
  return {
    ...mutation,
    mutate: (
      variables: { id: string; answer: string },
      options?: { onSuccess?: (entry: FaqAnswerEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id, answer: faqAnswerSchema.parse(variables.answer) },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ id, answer }: { id: string; answer: string }) => {
      const entry = await mutation.mutateAsync({ id, answer: faqAnswerSchema.parse(answer) });
      return entry;
    },
  };
}

export function useDeleteFaqAnswer() {
  const mutation = useLiveMutation<
    { id: string },
    { id: string; faqItemId?: string; answeredBy?: string }
  >(api.faq.deleteAnswer);
  return {
    ...mutation,
    mutate: (
      id: string,
      options?: {
        onSuccess?: (entry: { id: string; faqItemId?: string; answeredBy?: string }) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        { id },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (id: string) => await mutation.mutateAsync({ id }),
  };
}
