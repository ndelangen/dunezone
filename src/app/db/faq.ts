import { assetSubjectFacts } from '@shared/access/collaborativeAccess';
import { faqQuestionPageForViewer } from '@shared/faq/questionPageAccess';
import type { FaqTag } from '@shared/faq/tags';
import { faqAnswerSchema, faqQuestionSchema, faqTagsSchema } from '@shared/faq/validation';
import { usePaginatedQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { useMemo } from 'react';

import { db } from '@db/core';
import { factionCatalogueRowsToEntries } from '@db/factions';
import type { FactionCatalogueEntry } from '@db/factions';
import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';
import type { LiveMutationResult } from '@app/db/core/live';
import { useAssetAccess, useViewerUserId, UNAVAILABLE_SUBJECT } from '@app/db/viewerAccess';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { FaqListDetails, ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

type FaqItemRow = Doc<'faq_items'>;
type FaqAnswerRow = Doc<'faq_answers'>;
type FaqItemEntry = FaqItemRow;
/** An answer row. The alias exists so call sites read `Entry` like the rest of this layer; nothing is parsed or added. */
export type FaqAnswerEntry = FaqAnswerRow;

export type FaqItemWithDetails = FaqItemEntry & {
  faq_answers: FaqAnswerEntry[];
  asker_profile: ProfileSummary | null;
  list_details?: FaqListDetails;
};

export type FaqQuestionLocator = {
  rulesetSlug: string;
  questionSlug: string;
};

/** The question detail and first reference range, the same for every viewer. */
type ReferencePage = FunctionReturnType<typeof api.faq.questionPage>;
type ReferencePreview = ReferencePage['page'][number]['items'][number];
export type FaqReferenceTarget = FunctionArgs<typeof api.faqReferences.add>['target'];
export type FaqReferencePreview =
  | Exclude<ReferencePreview, { kind: 'faction' }>
  | {
      kind: 'faction';
      id: FactionCatalogueEntry['_id'];
      faction: FactionCatalogueEntry;
    };
export type RelatedFaqItem = FaqItemWithDetails & { ruleset: { name: string; slug: string } };
export type FaqQuestionPublicPage =
  | (NonNullable<ReferencePage['page'][number]['detail']> & {
      references: FaqReferencePreview[];
    })
  | null;

function referencePreviews(rows: ReferencePreview[]): FaqReferencePreview[] {
  return rows.map((row) =>
    row.kind === 'faction' ? { ...row, faction: factionCatalogueRowsToEntries([row.faction])[0] } : row
  );
}

/** Options are subscribed only while the FAQ's picker is mounted. */
export function useFaqReferenceOptions(kind: FaqReferenceTarget['kind'], q: string) {
  const query = usePaginatedQuery(api.faqReferences.options, { kind, q }, { initialNumItems: 12 });
  return { ...query, results: referencePreviews(query.results) };
}

type CommandState = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
};

/**
 * One FAQ action as this module hands it to a page: the mutation's pending and error state, plus a `run` that resolves rather than throwing.
 * The FAQ page drives several mutations from one component, so they are handed over in a uniform shape instead of as raw mutation results.
 */
export type FaqCommand<TVariables> = CommandState & {
  run: (variables: TVariables) => Promise<void>;
};

/** A `FaqCommand` whose action needs no arguments, such as accepting the answer already in hand. */
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

/** What `api.faq.rulesetFaq` gives a ruleset's FAQ page, the same for every viewer: a browsed page or a search, told apart by `mode`; null for an unknown ruleset. */
export type RulesetFaqPageData = FunctionReturnType<typeof api.faq.rulesetFaq>;
/** A browsed page of a ruleset's FAQ: newest first, counted, in numbered pages. */
export type RulesetFaqBrowseData = Exclude<NonNullable<RulesetFaqPageData>, { mode: 'search' }>;
/** A searched FAQ: the best matches first, and more by asking for a larger limit. */
export type RulesetFaqSearchData = Extract<NonNullable<RulesetFaqPageData>, { mode: 'search' }>;
/** What one ruleset FAQ page asks for: the ruleset, the route's search parameters and how many of a search's best matches to show, as `faq.rulesetFaq` takes them. */
export type RulesetFaqArgs = FunctionArgs<typeof api.faq.rulesetFaq>;

/** The ruleset FAQ route's loader, paired with `useRulesetFaqPage`; a searched page is not held, as each search is its own subscription. */
export async function loadRulesetFaqPage(args: RulesetFaqArgs): Promise<RulesetFaqPageData> {
  return await db.query(api.faq.rulesetFaq, args, { hold: !args.q });
}

/** One live ruleset FAQ page, taking `loadRulesetFaqPage`'s result for the same arguments as `initialData`. */
export function useRulesetFaqPage(args: RulesetFaqArgs, options?: { initialData?: RulesetFaqPageData }) {
  const liveData = useLiveQuery(api.faq.rulesetFaq, args, { hold: !args.q });
  return toLiveQueryResult(liveData, () => options?.initialData);
}

/** What `api.faq.search` gives the global FAQ page, the same for every viewer. */
export type GlobalFaqPageData = FunctionReturnType<typeof api.faq.search>;
/** What one global FAQ search asks for: the search, the ruleset slugs it narrows to, and how many of the best matches to show. */
export type GlobalFaqArgs = FunctionArgs<typeof api.faq.search>;

/** What `api.faq.rulesetOptions` gives the global FAQ's ruleset picker: every live ruleset holding questions, by name. */
export type GlobalFaqRulesetOptions = FunctionReturnType<typeof api.faq.rulesetOptions>;

/** The global FAQ route's loader for the ruleset picker, paired with `useGlobalFaqRulesetOptions`; one held answer for every search. */
export async function loadGlobalFaqRulesetOptions(): Promise<GlobalFaqRulesetOptions> {
  return await db.query(api.faq.rulesetOptions, {}, { hold: true });
}

/** The ruleset picker's options, live, taking `loadGlobalFaqRulesetOptions`'s result as `initialData`. */
export function useGlobalFaqRulesetOptions(options?: { initialData?: GlobalFaqRulesetOptions }) {
  const liveData = useLiveQuery(api.faq.rulesetOptions, {}, { hold: true });
  return toLiveQueryResult(liveData, () => options?.initialData);
}

/** The global FAQ route's loader, paired with `useGlobalFaqPage`; a searched page is not held, as each search is its own subscription. */
export async function loadGlobalFaqPage(args: GlobalFaqArgs): Promise<GlobalFaqPageData> {
  return await db.query(api.faq.search, args, { hold: !args.q });
}

/** One live global FAQ page, taking `loadGlobalFaqPage`'s result for the same arguments as `initialData`. */
export function useGlobalFaqPage(args: GlobalFaqArgs, options?: { initialData?: GlobalFaqPageData }) {
  const liveData = useLiveQuery(api.faq.search, args, { hold: !args.q });
  return toLiveQueryResult(liveData, () => options?.initialData);
}

/** The question route's loader, paired with `useFaqQuestionPage`. */
export async function loadFaqQuestionPage(locator: FaqQuestionLocator): Promise<FaqQuestionPublicPage> {
  const result = await db.query(
    api.faq.questionPage,
    {
      ...locator,
      paginationOpts: { numItems: 12, cursor: null },
    },
    { hold: false }
  );
  const first = result.page[0];
  return first.detail ? { ...first.detail, references: referencePreviews(first.items) } : null;
}

/**
 * The question page, live, with the commands that act on it.
 * The loader's result goes in as `initialPage`, not `initialData`: this hook returns commands beside the query, so its options do not match the plain read hooks elsewhere in this layer.
 */
export function useFaqQuestionPage(locator: FaqQuestionLocator, options?: { initialPage?: FaqQuestionPublicPage }) {
  const referencesQuery = usePaginatedQuery(api.faq.questionPage, locator, { initialNumItems: 12 });
  const first = referencesQuery.results[0];
  const livePage = first === undefined ? undefined : first.detail;
  const publicPage = livePage === undefined ? options?.initialPage : livePage;
  const query = toLiveQueryResult(livePage, () => options?.initialPage);
  const references = first
    ? referencePreviews(referencesQuery.results.flatMap((chunk) => chunk.items))
    : (options?.initialPage?.references ?? []);
  const rulesetAccess = useAssetAccess(
    assetSubjectFacts(
      'ruleset',
      publicPage ? { owner_id: publicPage.referenceRuleset.owner_id, is_deleted: false } : UNAVAILABLE_SUBJECT,
      publicPage?.referenceRuleset.assignedGroup ?? null
    )
  );
  const questionId = publicPage?.question.id;
  /*
   * The page is one cached answer for everyone; who may edit, delete, accept or answer is decided here from the viewer's user id
   * and whether they have answered. Until both settle the viewer counts as signed out, so no control appears before it may.
   * A signed-out viewer asks about no question, which answers without a read.
   */
  const viewerId = useViewerUserId();
  const viewerAnswered = useLiveQuery(api.faq.viewerAnswered, { questionId: viewerId ? (questionId ?? null) : null });
  const viewerResolved = viewerId !== undefined && viewerAnswered !== undefined;
  const resolvedViewerId = viewerResolved ? viewerId : null;
  const answered = viewerAnswered ?? false;
  /*
   * Memoized on its real inputs: the question route scrolls to an answer's hash whenever the question or answers change identity,
   * so a fresh object on every render would scroll the page back on each keystroke while editing.
   */
  const page = useMemo(
    () =>
      publicPage ? { ...faqQuestionPageForViewer(publicPage, resolvedViewerId, answered), viewerResolved } : undefined,
    [publicPage, resolvedViewerId, answered, viewerResolved]
  );

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

  const addReferenceMutation = useLiveMutation<FunctionArgs<typeof api.faqReferences.add>, unknown>(
    api.faqReferences.add
  );
  const removeReferenceMutation = useLiveMutation<FunctionArgs<typeof api.faqReferences.remove>, unknown>(
    api.faqReferences.remove
  );

  const requireQuestionId = () => {
    if (!questionId) {
      throw new Error('FAQ question is not loaded');
    }
    return questionId;
  };

  return {
    ...query,
    page,
    references,
    referencesStatus: referencesQuery.status,
    loadMoreReferences: () => referencesQuery.loadMore(12),
    hasAnswered: viewerResolved && viewerId !== null && answered,
    canManageReferences:
      viewerResolved &&
      (resolvedViewerId === publicPage?.question.askedBy ||
        (rulesetAccess.resolved && rulesetAccess.viewerAccess.capabilities.edit)),
    addReference: command(addReferenceMutation, (target: FaqReferenceTarget) => ({
      questionId: requireQuestionId(),
      target: target.kind === 'faction' ? { kind: target.kind, id: target.id } : { kind: target.kind, id: target.id },
    })),
    removeReference: command(removeReferenceMutation, (target: FaqReferenceTarget) => ({
      questionId: requireQuestionId(),
      target: target.kind === 'faction' ? { kind: target.kind, id: target.id } : { kind: target.kind, id: target.id },
    })),
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

/** Asks a question about a ruleset, optionally with the asker's own first answer. Resolves to the locator the new question's route needs. */
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
