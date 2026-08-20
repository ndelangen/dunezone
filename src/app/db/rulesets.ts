import { rulesetInputSchema } from '@shared/rulesets/validation';
import type { RulesetInput } from '@shared/rulesets/validation';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { factionCatalogueRowsToEntries } from '@db/factions';
import type { FactionCatalogueEntry } from '@db/factions';
import type { FaqAnswerEntry, FaqItemWithDetails } from '@db/faq';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary, CollaborativeAccess } from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

/** What a caller authors, derived from the schema that validates it — both fields required, the description above its floor. */
export type Ruleset = RulesetInput;
export type RulesetRow = Doc<'rulesets'>;
export type RulesetEntry = Omit<RulesetRow, 'name'> & {
  name: Ruleset['name'];
  id: RulesetRow['_id'];
};
export type RulesetPageData = {
  ruleset: RulesetEntry;
  /** Catalogue-shaped, so the page renders its factions with the same vocabulary the catalogue uses. */
  factions: FactionCatalogueEntry[];
  viewerAccess: Extract<CollaborativeAccess, { kind: 'ruleset' }>;
};

export type RulesetDetailPageData = RulesetPageData & {
  owner: ProfileSummary | null;
  assignableGroups: AssignedGroupSummary[];
  faqItems: FaqItemWithDetails[];
};

function toRulesetPageData(raw: FunctionReturnType<typeof api.rulesets.getBySlug>): RulesetPageData {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: factionCatalogueRowsToEntries(raw.factions),
    viewerAccess: raw.viewerAccess,
  };
}

/** Canonical detail page model, shared by the route loader and the live subscription. */
function normalizeRulesetDetailPage(
  raw: NonNullable<FunctionReturnType<typeof api.rulesets.detailPageBySlug>>
): RulesetDetailPageData {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: factionCatalogueRowsToEntries(raw.factions),
    viewerAccess: raw.viewerAccess,
    owner: raw.owner,
    assignableGroups: raw.assignableGroups,
    faqItems: mapFaqItemsFromConvex(raw.faqItems),
  };
}

type FaqItemConvexRow = Omit<FaqItemWithDetails, 'id' | 'faq_answers'> & {
  faq_answers: Omit<FaqAnswerEntry, 'id'>[];
};

function mapFaqItemsFromConvex(items: FaqItemConvexRow[]): FaqItemWithDetails[] {
  return items.map((item) => ({
    ...item,
    id: item._id,
    faq_answers: item.faq_answers.map((answer) => ({ ...answer, id: answer._id })),
  }));
}

function toRulesetEntry(entry: RulesetRow): RulesetEntry {
  return {
    ...entry,
    id: entry._id,
    name: entry.name,
  };
}

export function rulesetRowsToEntries(entries: RulesetRow[]): RulesetEntry[] {
  return entries.map(toRulesetEntry);
}

export async function loadRulesetsAll(): Promise<RulesetEntry[]> {
  const entries = await db.query(api.rulesets.list, {});
  return rulesetRowsToEntries(entries);
}

export async function loadRulesetBySlug(slug: string): Promise<RulesetPageData> {
  const result = await db.query(api.rulesets.getBySlug, { slug });
  return toRulesetPageData(result);
}

export async function loadRulesetDetailPage(slug: string): Promise<RulesetDetailPageData | null> {
  const raw = await db.query(api.rulesets.detailPageBySlug, { slug });
  return raw ? normalizeRulesetDetailPage(raw) : null;
}

export function useRulesetsAll(options?: { initialData?: RulesetEntry[] }) {
  const liveData = useQuery(api.rulesets.list, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map(toRulesetEntry),
  };
}

export function useRulesetBySlug(slug: string, options?: { initialData?: RulesetPageData }) {
  const liveData = useQuery(api.rulesets.getBySlug, { slug });
  const normalized = liveData ? toRulesetPageData(liveData) : undefined;
  const result = toLiveQueryResult(normalized, true, () => options?.initialData);
  return result;
}

export function useRulesetDetailPage(slug: string, options?: { initialData?: RulesetDetailPageData }) {
  const liveData = useQuery(api.rulesets.detailPageBySlug, {
    slug,
  });
  const normalized: RulesetDetailPageData | null | undefined =
    liveData === undefined ? undefined : liveData === null ? null : normalizeRulesetDetailPage(liveData);
  const result = toLiveQueryResult(normalized, true, () => options?.initialData);
  return result;
}

export function useCreateRuleset() {
  type CreatedRulesetResult = FunctionReturnType<typeof api.rulesets.create>;
  const toCreatedRulesetEntry = (entry: CreatedRulesetResult) => ({
    ...entry,
    id: entry._id,
    name: entry.name,
  });
  const mutation = useLiveMutation<
    { name: string; description: string; group_id?: string | null; image_cover: string | null },
    CreatedRulesetResult
  >(api.rulesets.create);
  return {
    ...mutation,
    mutate: (
      variables: { input: Ruleset; groupId?: string | null; imageCover?: string | null },
      options?: {
        onSuccess?: (entry: RulesetEntry & { default_group_unavailable: boolean }) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        {
          ...rulesetInputSchema.parse(variables.input),
          ...(variables.groupId === undefined ? {} : { group_id: variables.groupId }),
          image_cover: variables.imageCover ?? null,
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(toCreatedRulesetEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({
      input,
      groupId,
      imageCover,
    }: {
      input: Ruleset;
      groupId?: string | null;
      imageCover?: string | null;
    }) => {
      const validated = rulesetInputSchema.parse(input);
      const entry = await mutation.mutateAsync({
        ...validated,
        ...(groupId === undefined ? {} : { group_id: groupId }),
        image_cover: imageCover ?? null,
      });
      return toCreatedRulesetEntry(entry);
    },
  };
}

export function useUpdateRuleset() {
  const mutation = useLiveMutation<
    { id: string; name: string; description: string; image_cover?: string | null },
    RulesetRow
  >(api.rulesets.update);
  return {
    ...mutation,
    mutate: (
      variables: {
        input: Ruleset;
        id: string;
        imageCover?: string | null;
      },
      options?: {
        onSuccess?: (entry: RulesetEntry) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        {
          id: variables.id,
          ...rulesetInputSchema.parse(variables.input),
          image_cover: variables.imageCover,
        },
        {
          onSuccess: (entry) =>
            options?.onSuccess?.({
              ...entry,
              id: entry._id,
              name: entry.name,
            }),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ input, id, imageCover }: { input: Ruleset; id: string; imageCover?: string | null }) => {
      const validated = rulesetInputSchema.parse(input);
      const entry = await mutation.mutateAsync({
        id,
        ...validated,
        image_cover: imageCover,
      });
      return { ...entry, id: entry._id, name: validated.name };
    },
  };
}

/** Moves a ruleset between maintaining groups, or clears the assignment with `null`. The peer of `useSetFactionGroup`. */
export function useSetRulesetGroup() {
  const mutation = useLiveMutation<{ id: string; group_id: string | null }, RulesetRow>(api.rulesets.setGroup);
  return {
    ...mutation,
    mutate: (
      variables: { id: string; groupId: string | null },
      options?: { onSuccess?: (entry: RulesetEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id, group_id: variables.groupId },
        {
          onSuccess: (entry) => options?.onSuccess?.(toRulesetEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ id, groupId }: { id: string; groupId: string | null }) => {
      const entry = await mutation.mutateAsync({ id, group_id: groupId });
      return toRulesetEntry(entry);
    },
  };
}

type RulesetFactionLink = { rulesetId: string; factionId: string };

/**
 * The two link mutations differ only in which function they call, so they share one wrapper.
 * It exists to keep callers in this module's camelCase vocabulary — every other hook here maps to the Convex snake_case at this boundary rather than leaking it into the routes.
 */
function useRulesetFactionLinkMutation(reference: typeof api.rulesets.addFaction) {
  const mutation = useLiveMutation<{ ruleset_id: string; faction_id: string }, unknown>(reference);
  const toArgs = ({ rulesetId, factionId }: RulesetFactionLink) => ({
    ruleset_id: rulesetId,
    faction_id: factionId,
  });
  return {
    ...mutation,
    mutate: (variables: RulesetFactionLink, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) =>
      mutation.mutate(toArgs(variables), { onSuccess: () => options?.onSuccess?.(), onError: options?.onError }),
    mutateAsync: async (variables: RulesetFactionLink) => await mutation.mutateAsync(toArgs(variables)),
  };
}

/**
 * Links a faction to a ruleset, and unlinks it.
 * Both are gated server-side on the ruleset's `edit` capability — its owner, or an active member of its maintaining group — so the page shows the affordances on the same condition.
 */
export function useAddRulesetFaction() {
  return useRulesetFactionLinkMutation(api.rulesets.addFaction);
}

export function useRemoveRulesetFaction() {
  return useRulesetFactionLinkMutation(api.rulesets.removeFaction);
}

export function useDeleteRuleset() {
  const mutation = useLiveMutation<{ id: string }, void>(api.rulesets.softDelete);
  return {
    ...mutation,
    mutate: (id: string, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) =>
      mutation.mutate(
        { id },
        {
          onSuccess: () => options?.onSuccess?.(),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (id: string) => await mutation.mutateAsync({ id }),
  };
}

/** Rulesets the viewer owns, for the Group detail page's "add a ruleset" picker. */
export function useRulesetsOwnedForGroupAssign() {
  const liveData = useQuery(api.rulesets.listOwnedForGroupAssign, {});
  return toLiveQueryResult(liveData, true);
}
