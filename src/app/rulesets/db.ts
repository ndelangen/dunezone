import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import type { FaqAnswerEntry, FaqItemWithDetails } from '@db/faq';
import { parseClientBoundary } from '@app/db/core/clientBoundary';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import { rulesetInputSchema } from '@app/rulesets/validation';
import { BackgroundClientSchema } from '@game/schema/faction';
import type { FactionData } from '@game/schema/faction';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type {
  AssignedGroupSummary,
  CollaborativeAccess,
} from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

export type Ruleset = { name: string };
export type RulesetRow = Doc<'rulesets'>;
export type RulesetEntry = Omit<RulesetRow, 'name'> & {
  name: Ruleset['name'];
  id: RulesetRow['_id'];
};
export type RulesetFactionSummary = {
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
          background: parseClientBoundary(
            BackgroundClientSchema,
            faction.identity.background,
            'Faction identity'
          ),
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

function toRulesetPageData(
  raw: FunctionReturnType<typeof api.rulesets.getBySlug>
): RulesetPageData {
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

export function useRulesetDetailPage(
  slug: string,
  options?: { initialData?: RulesetDetailPageData }
) {
  const liveData = useQuery(api.rulesets.detailPageBySlug, {
    slug,
  });
  const normalized: RulesetDetailPageData | null | undefined =
    liveData === undefined
      ? undefined
      : liveData === null
        ? null
        : normalizeRulesetDetailPage(liveData);
  const result = toLiveQueryResult(normalized, true, () => options?.initialData);
  return result;
}

export function useCreateRuleset() {
  const mutation = useLiveMutation<
    { name: string; group_id: string | null; image_cover: string | null },
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
          name: rulesetInputSchema.parse({ name: variables.input.name }).name,
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
      const validatedName = rulesetInputSchema.parse({ name: input.name }).name;
      const entry = await mutation.mutateAsync({
        name: validatedName,
        group_id: groupId ?? null,
        image_cover: imageCover ?? null,
      });
      return { ...entry, id: entry._id, name: validatedName };
    },
  };
}

export function useUpdateRuleset() {
  const mutation = useLiveMutation<
    { id: string; name: string; group_id?: string | null; image_cover?: string | null },
    RulesetRow
  >(api.rulesets.update);
  return {
    ...mutation,
    mutate: (
      variables: {
        input: Ruleset;
        id: string;
        groupId?: string | null;
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
          name: rulesetInputSchema.parse({ name: variables.input.name }).name,
          group_id: variables.groupId,
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
    mutateAsync: async ({
      input,
      id,
      groupId,
      imageCover,
    }: {
      input: Ruleset;
      id: string;
      groupId?: string | null;
      imageCover?: string | null;
    }) => {
      const validatedName = rulesetInputSchema.parse({ name: input.name }).name;
      const entry = await mutation.mutateAsync({
        id,
        name: validatedName,
        group_id: groupId,
        image_cover: imageCover,
      });
      return { ...entry, id: entry._id, name: validatedName };
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

export function useAddFactionToRuleset() {
  return useLiveMutation<
    { ruleset_id: string; faction_id: string },
    { ruleset_id: string; faction_id: string }
  >(api.rulesets.addFaction);
}

export function useRemoveFactionFromRuleset() {
  return useLiveMutation<
    { ruleset_id: string; faction_id: string },
    { ruleset_id: string; faction_id: string }
  >(api.rulesets.removeFaction);
}
