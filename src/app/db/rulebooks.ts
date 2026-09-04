import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsV1 } from '@shared/rulebooks/contents';
import { rulebookNameSchema, rulebookRevisionSchema } from '@shared/rulebooks/metadata';
import { useQuery } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult, useMappedLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type RulebookMetadata = FunctionReturnType<typeof api.rulebooks.rename>;
export type RulebookListEntry = FunctionReturnType<typeof api.rulebooks.listByRulesetSlug>[number];

type RawEditorBundle = NonNullable<FunctionReturnType<typeof api.rulebooks.editorBySlugs>>;
type RawDraft = RawEditorBundle['draft'];
type RawEdition = RawEditorBundle['edition'];

export type RulebookSavedDraft = Omit<RawDraft, 'contents'> & {
  contents: RulebookContentsV1;
};
export type RulebookEdition = Omit<RawEdition, 'contents'> & {
  contents: RulebookContentsV1;
};
export type RulebookEditorData = {
  rulebook: RulebookMetadata;
  draft: RulebookSavedDraft;
  edition: RulebookEdition;
};
type RawEditorPage = NonNullable<FunctionReturnType<typeof api.rulebooks.editorPage>>;
export type RulebookEditorPageData =
  | Exclude<RawEditorPage, { kind: 'editable' }>
  | (Omit<Extract<RawEditorPage, { kind: 'editable' }>, 'draft'> & {
      draft: RulebookSavedDraft;
    });
export type RulebookCreateSource = { kind: 'starter' } | { kind: 'clone'; rulebookId: RulebookMetadata['_id'] };
export type RulesetRulebooksLocator = { rulesetSlug: string };
export type RulebookLocator = RulesetRulebooksLocator & {
  rulebookSlug: string;
};
export type RulebookReaderLocator = RulebookLocator & {
  editionNumber?: number;
};
export type RulebookCreationPageData = NonNullable<FunctionReturnType<typeof api.rulebooks.creationPage>>;
type RawReaderPage = NonNullable<FunctionReturnType<typeof api.rulebooks.readerPage>>;
export type RulebookReaderPageData = Omit<RawReaderPage, 'edition'> & {
  edition: Omit<RawReaderPage['edition'], 'contents'> & {
    contents: RulebookContentsV1;
  };
};

function normalizeReaderPage(raw: RawReaderPage): RulebookReaderPageData {
  return {
    ...raw,
    edition: {
      ...raw.edition,
      contents: rulebookContentsV1Schema.parse(raw.edition.contents),
    },
  };
}

export async function loadRulebookReader({ rulesetSlug, rulebookSlug, editionNumber }: RulebookReaderLocator) {
  const raw = await db.query(api.rulebooks.readerPage, {
    ruleset_slug: rulesetSlug,
    rulebook_slug: rulebookSlug,
    ...(editionNumber === undefined ? {} : { edition_number: editionNumber }),
  });
  return raw ? normalizeReaderPage(raw) : null;
}

export function useRulebookReader({
  rulesetSlug,
  rulebookSlug,
  editionNumber,
  initialData,
}: RulebookReaderLocator & { initialData?: RulebookReaderPageData | null }) {
  const raw = useQuery(api.rulebooks.readerPage, {
    ruleset_slug: rulesetSlug,
    rulebook_slug: rulebookSlug,
    ...(editionNumber === undefined ? {} : { edition_number: editionNumber }),
  });
  const normalized = raw === undefined ? undefined : raw === null ? null : normalizeReaderPage(raw);
  return toLiveQueryResult(normalized, () => initialData);
}

export type RulebookEditionHistoryData = NonNullable<FunctionReturnType<typeof api.rulebooks.editionHistory>>;

export async function loadRulebookEditionHistory({ rulesetSlug, rulebookSlug }: RulebookLocator) {
  return await db.query(api.rulebooks.editionHistory, { ruleset_slug: rulesetSlug, rulebook_slug: rulebookSlug });
}

export function useRulebookEditionHistory({
  rulesetSlug,
  rulebookSlug,
  initialData,
}: RulebookLocator & { initialData?: RulebookEditionHistoryData | null }) {
  return toLiveQueryResult(
    useQuery(api.rulebooks.editionHistory, { ruleset_slug: rulesetSlug, rulebook_slug: rulebookSlug }),
    () => initialData
  );
}

export async function loadRulebookCreationPage(rulesetSlug: string) {
  return await db.query(api.rulebooks.creationPage, {
    ruleset_slug: rulesetSlug,
  });
}

export function useRulebookCreationPage(rulesetSlug: string, initialData?: RulebookCreationPageData | null) {
  return toLiveQueryResult(useQuery(api.rulebooks.creationPage, { ruleset_slug: rulesetSlug }), () => initialData);
}

function useIdentityRulebookMutation<TVariables, TRawVariables, TResult>(
  mutationRef: FunctionReference<'mutation'>,
  toRawVariables: (variables: TVariables) => TRawVariables
) {
  return useMappedLiveMutation<TVariables, TRawVariables, TResult, TResult>(
    mutationRef,
    toRawVariables,
    (result) => result
  );
}

function identityRulebookMutationHook<TVariables, TRawVariables, TResult>(
  mutationRef: FunctionReference<'mutation'>,
  toRawVariables: (variables: TVariables) => TRawVariables
) {
  return function useRulebookMutation() {
    return useIdentityRulebookMutation<TVariables, TRawVariables, TResult>(mutationRef, toRawVariables);
  };
}

function normalizeEditorBundle(raw: RawEditorBundle): RulebookEditorData {
  return {
    rulebook: raw.rulebook,
    draft: {
      ...raw.draft,
      contents: rulebookContentsV1Schema.parse(raw.draft.contents),
    },
    edition: {
      ...raw.edition,
      contents: rulebookContentsV1Schema.parse(raw.edition.contents),
    },
  };
}

function normalizeEditorPage(raw: RawEditorPage): RulebookEditorPageData {
  return raw.kind === 'editable'
    ? {
        ...raw,
        draft: {
          ...raw.draft,
          contents: rulebookContentsV1Schema.parse(raw.draft.contents),
        },
      }
    : raw;
}

/** Ordered Rulebook metadata for one Ruleset, paired with `useRulebooksByRulesetSlug`. */
export async function loadRulebooksByRulesetSlug({
  rulesetSlug,
}: RulesetRulebooksLocator): Promise<RulebookMetadata[]> {
  return await db.query(api.rulebooks.listByRulesetSlug, {
    ruleset_slug: rulesetSlug,
  });
}

/** One Rulebook editor's access, saved draft, and referenced images, paired with `useRulebookEditor`. */
export async function loadRulebookEditor({
  rulesetSlug,
  rulebookSlug,
}: RulebookLocator): Promise<RulebookEditorPageData | null> {
  const raw = await db.query(api.rulebooks.editorPage, {
    ruleset_slug: rulesetSlug,
    rulebook_slug: rulebookSlug,
  });
  return raw ? normalizeEditorPage(raw) : null;
}

export function useRulebooksByRulesetSlug({
  rulesetSlug,
  initialData,
}: RulesetRulebooksLocator & { initialData?: RulebookMetadata[] }) {
  const live = useQuery(api.rulebooks.listByRulesetSlug, {
    ruleset_slug: rulesetSlug,
  });
  return toLiveQueryResult(live, () => initialData);
}

export function useRulebookEditor({
  rulesetSlug,
  rulebookSlug,
  initialData,
}: RulebookLocator & { initialData?: RulebookEditorPageData | null }) {
  const live = useQuery(api.rulebooks.editorPage, {
    ruleset_slug: rulesetSlug,
    rulebook_slug: rulebookSlug,
  });
  const normalized = live === undefined ? undefined : live === null ? null : normalizeEditorPage(live);
  return toLiveQueryResult(normalized, () => initialData);
}

export function useCreateRulebook() {
  type Variables = {
    rulesetId: RulebookMetadata['ruleset_id'];
    name: string;
    source: RulebookCreateSource;
  };
  return useMappedLiveMutation<
    Variables,
    {
      ruleset_id: RulebookMetadata['ruleset_id'];
      name: string;
      source: { kind: 'starter' } | { kind: 'clone'; rulebook_id: RulebookMetadata['_id'] };
    },
    FunctionReturnType<typeof api.rulebooks.create>,
    RulebookEditorData
  >(
    api.rulebooks.create,
    (variables: Variables) => ({
      ruleset_id: variables.rulesetId,
      name: rulebookNameSchema.parse(variables.name),
      source:
        variables.source.kind === 'starter'
          ? variables.source
          : {
              kind: 'clone' as const,
              rulebook_id: variables.source.rulebookId,
            },
    }),
    normalizeEditorBundle
  );
}

export function useSaveRulebook() {
  type RawResult = FunctionReturnType<typeof api.rulebooks.save>;
  type Variables = {
    rulebookId: RulebookMetadata['_id'];
    expectedRevision: number;
    contents: RulebookContentsV1;
  };
  return useMappedLiveMutation<
    Variables,
    {
      rulebook_id: RulebookMetadata['_id'];
      expected_revision: number;
      contents: RulebookContentsV1;
    },
    RawResult,
    Omit<RawResult, 'draft'> & { draft: RulebookSavedDraft }
  >(
    api.rulebooks.save,
    (variables: Variables) => ({
      rulebook_id: variables.rulebookId,
      expected_revision: rulebookRevisionSchema.parse(variables.expectedRevision),
      contents: rulebookContentsV1Schema.parse(variables.contents),
    }),
    (result) => ({
      ...result,
      draft: {
        ...result.draft,
        contents: rulebookContentsV1Schema.parse(result.draft.contents),
      },
    })
  );
}

export function usePublishRulebook() {
  type RawResult = FunctionReturnType<typeof api.rulebooks.publish>;
  type Variables = {
    rulebookId: RulebookMetadata['_id'];
    expectedRevision: number;
  };
  return useMappedLiveMutation<
    Variables,
    {
      rulebook_id: RulebookMetadata['_id'];
      expected_revision: number;
      confirmed: true;
    },
    RawResult,
    RawResult
  >(
    api.rulebooks.publish,
    (variables: Variables) => ({
      rulebook_id: variables.rulebookId,
      expected_revision: rulebookRevisionSchema.parse(variables.expectedRevision),
      confirmed: true,
    }),
    (result) => result
  );
}

export const useReorderRulebooks = identityRulebookMutationHook<
  {
    rulesetId: RulebookMetadata['ruleset_id'];
    rulebookIds: RulebookMetadata['_id'][];
  },
  {
    ruleset_id: RulebookMetadata['ruleset_id'];
    rulebook_ids: RulebookMetadata['_id'][];
  },
  FunctionReturnType<typeof api.rulebooks.reorder>
>(api.rulebooks.reorder, (variables) => ({
  ruleset_id: variables.rulesetId,
  rulebook_ids: variables.rulebookIds,
}));

export const useRenameRulebook = identityRulebookMutationHook<
  { rulebookId: RulebookMetadata['_id']; name: string },
  { rulebook_id: RulebookMetadata['_id']; name: string },
  FunctionReturnType<typeof api.rulebooks.rename>
>(api.rulebooks.rename, (variables) => ({
  rulebook_id: variables.rulebookId,
  name: rulebookNameSchema.parse(variables.name),
}));

export const useSoftDeleteRulebook = identityRulebookMutationHook<
  { rulebookId: RulebookMetadata['_id'] },
  { rulebook_id: RulebookMetadata['_id'] },
  FunctionReturnType<typeof api.rulebooks.softDelete>
>(api.rulebooks.softDelete, (variables) => ({
  rulebook_id: variables.rulebookId,
}));

export const useRetryRulebookFirstPagePreview = identityRulebookMutationHook<
  { rulebookId: RulebookMetadata['_id'] },
  { rulebook_id: RulebookMetadata['_id'] },
  FunctionReturnType<typeof api.rulebooks.retryFirstPagePreview>
>(api.rulebooks.retryFirstPagePreview, (variables) => ({
  rulebook_id: variables.rulebookId,
}));
