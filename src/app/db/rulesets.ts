import { BackgroundClientSchema } from '@shared/factions/schema';
import type { FactionData } from '@shared/factions/schema';
import { rulesetInputSchema } from '@shared/rulesets/validation';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import type { FaqAnswerEntry, FaqItemWithDetails } from '@db/faq';
import { parseClientBoundary } from '@app/db/core/clientBoundary';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary, CollaborativeAccess } from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

/**
 * What a caller authors.
 * `description` is optional for the widen phase only — omitting it leaves an existing description untouched, and the
 * 50-character floor applies to anything supplied.
 */
export type Ruleset = { name: string; description?: string };
export type RulesetRow = Doc<'rulesets'>;
export type RulesetEntry = Omit<RulesetRow, 'name'> & {
  name: Ruleset['name'];
  id: RulesetRow['_id'];
};
type RulesetFactionSummary = {
  factionId: string;
  name: string;
  urlSlug: string;
  identity: Pick<FactionData, 'logo' | 'background'> | null;
};

type RulesetFactionSummaryRaw = Omit<RulesetFactionSummary, 'identity'> & {
  identity: { logo: FactionData['logo']; background: unknown } | null;
};

function normalizeRulesetFactionSummary(faction: RulesetFactionSummaryRaw): RulesetFactionSummary {
  return {
    ...faction,
    identity: faction.identity
      ? {
          logo: faction.identity.logo,
          background: parseClientBoundary(BackgroundClientSchema, faction.identity.background, 'Faction identity'),
        }
      : null,
  };
}

export type RulesetPageData = {
  ruleset: RulesetEntry;
  factions: RulesetFactionSummary[];
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
    factions: raw.factions.map(normalizeRulesetFactionSummary),
    viewerAccess: raw.viewerAccess,
  };
}

/** Canonical detail page model, shared by the route loader and the live subscription. */
function normalizeRulesetDetailPage(
  raw: NonNullable<FunctionReturnType<typeof api.rulesets.detailPageBySlug>>
): RulesetDetailPageData {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: raw.factions.map(normalizeRulesetFactionSummary),
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
  const mutation = useLiveMutation<
    { name: string; description?: string; group_id: string | null; image_cover: string | null },
    RulesetRow
  >(api.rulesets.create);
  return {
    ...mutation,
    mutate: (
      variables: { input: Ruleset; groupId?: string | null; imageCover?: string | null },
      options?: {
        onSuccess?: (entry: RulesetEntry) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        {
          ...rulesetInputSchema.parse(variables.input),
          group_id: variables.groupId ?? null,
          image_cover: variables.imageCover ?? null,
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
        group_id: groupId ?? null,
        image_cover: imageCover ?? null,
      });
      return { ...entry, id: entry._id, name: validated.name };
    },
  };
}

export function useUpdateRuleset() {
  const mutation = useLiveMutation<
    { id: string; name: string; description?: string; image_cover?: string | null },
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
