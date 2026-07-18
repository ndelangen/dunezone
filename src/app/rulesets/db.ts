import { useQuery } from 'convex/react';

import { db } from '@db/core';
import type { FaqAnswerEntry, FaqItemWithDetails } from '@db/faq';
import type { GroupMemberRow, UserGroupMembershipWithGroup } from '@db/members';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import { rulesetInputSchema } from '@app/rulesets/validation';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type Ruleset = { name: string };
export type RulesetRow = Doc<'rulesets'>;
export type RulesetEntry = Omit<RulesetRow, 'name'> & {
  name: Ruleset['name'];
  id: RulesetRow['_id'];
};
export type RulesetInsert = Omit<RulesetEntry, 'name'> & {
  name: Ruleset['name'];
};
export type RulesetUpdate = Omit<Partial<RulesetEntry>, 'name'> & {
  name?: Ruleset['name'];
};

export type RulesetPageData = {
  ruleset: RulesetEntry;
  factions: { factionId: string; name: string; urlSlug: string }[];
  canAccess: boolean;
};

export type RulesetDetailPageData = RulesetPageData & {
  owner: FaqItemWithDetails['asker_profile'];
  /** Active memberships + groups for assign-group UI; null when viewer is not logged in. */
  viewerAssignableMemberships: UserGroupMembershipWithGroup[] | null;
  groupAccess: {
    group: Doc<'groups'>;
    members: Array<{
      membership: Doc<'group_members'>;
      profile: FaqItemWithDetails['asker_profile'];
    }>;
  } | null;
  faqItems: FaqItemWithDetails[];
};

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

type AssignableMembershipConvexRow = GroupMemberRow & {
  groups: { id: string; name: string; slug: string } | null;
};

function mapViewerAssignableMembershipsFromConvex(
  rows: AssignableMembershipConvexRow[] | null
): UserGroupMembershipWithGroup[] | null {
  if (rows == null) return null;
  return rows.map((entry) => ({ ...entry, id: entry._id, groups: entry.groups }));
}

function toRulesetEntry(entry: RulesetRow): RulesetEntry {
  return {
    ...entry,
    id: entry._id,
    name: rulesetInputSchema.parse({ name: entry.name }).name,
  };
}

export async function loadRulesetsAll(): Promise<RulesetEntry[]> {
  const entries = await db.query<RulesetRow[]>(api.rulesets.list, {});
  return entries.map(toRulesetEntry);
}

export async function loadRuleset(id: string): Promise<RulesetEntry> {
  const entry = await db.query<RulesetRow>(api.rulesets.get, { id });
  return toRulesetEntry(entry);
}

export async function loadRulesetBySlug(slug: string): Promise<RulesetPageData> {
  const result = await db.query<{
    ruleset: RulesetRow;
    factions: { factionId: string; name: string; urlSlug: string }[];
    canAccess: boolean;
  }>(api.rulesets.getBySlug, { slug });
  return {
    ...result,
    ruleset: toRulesetEntry(result.ruleset),
  };
}

export async function loadRulesetDetailPage(slug: string): Promise<RulesetDetailPageData | null> {
  const raw = await db.query<{
    ruleset: RulesetRow;
    factions: { factionId: string; name: string; urlSlug: string }[];
    canAccess: boolean;
    owner: RulesetDetailPageData['owner'];
    viewerAssignableMemberships: AssignableMembershipConvexRow[] | null;
    groupAccess: RulesetDetailPageData['groupAccess'];
    faqItems: FaqItemConvexRow[];
  } | null>(api.rulesets.detailPageBySlug, { slug });
  if (!raw) return null;
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: raw.factions,
    canAccess: raw.canAccess,
    owner: raw.owner,
    viewerAssignableMemberships: mapViewerAssignableMembershipsFromConvex(
      raw.viewerAssignableMemberships
    ),
    groupAccess: raw.groupAccess,
    faqItems: mapFaqItemsFromConvex(raw.faqItems),
  };
}

export async function loadRulesetFactions(rulesetId: string): Promise<string[]> {
  return await db.query<string[]>(api.rulesets.factionIds, { ruleset_id: rulesetId });
}

export async function loadRulesetFactionsWithDetails(
  rulesetId: string
): Promise<{ factionId: string; name: string; urlSlug: string }[]> {
  return await db.query<{ factionId: string; name: string; urlSlug: string }[]>(
    api.rulesets.factionDetails,
    { ruleset_id: rulesetId }
  );
}

export async function loadCanAccessRuleset(rulesetId: string): Promise<boolean> {
  return await db.query<boolean>(api.rulesets.canAccess, { ruleset_id: rulesetId });
}

export function useCanAccessRuleset(rulesetId: string) {
  const liveData = useQuery(api.rulesets.canAccess, { ruleset_id: rulesetId } as never) as
    | boolean
    | undefined;
  return toLiveQueryResult(liveData, true);
}

export async function loadRulesetsByFaction(factionId: string): Promise<RulesetEntry[]> {
  const entries = await db.query<RulesetRow[]>(api.rulesets.listByFaction, {
    faction_id: factionId,
  });
  return entries.map(toRulesetEntry);
}

export function useRulesetsAll(options?: { initialData?: RulesetEntry[] }) {
  const liveData = useQuery(api.rulesets.list, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map(toRulesetEntry),
  };
}

export function useRuleset(id: string) {
  const liveData = useQuery(api.rulesets.get, { id } as never) as RulesetRow | undefined;
  const result = toLiveQueryResult(liveData, true);
  return {
    ...result,
    data: result.data
      ? {
          ...result.data,
          id: result.data._id,
          name: rulesetInputSchema.parse({ name: result.data.name }).name,
        }
      : undefined,
  };
}

export function useRulesetBySlug(slug: string, options?: { initialData?: RulesetPageData }) {
  const liveData = useQuery(api.rulesets.getBySlug, { slug });
  const result = toLiveQueryResult<{
    ruleset: RulesetRow;
    factions: { factionId: string; name: string; urlSlug: string }[];
    canAccess: boolean;
  } | null>(liveData, true, () => (options?.initialData as never) ?? undefined);
  return {
    ...result,
    ruleset: result.data ? toRulesetEntry(result.data.ruleset) : undefined,
    factions: result.data?.factions,
    canAccess: result.data?.canAccess ?? false,
  };
}

export function useRulesetDetailPage(
  slug: string,
  options?: { initialData?: RulesetDetailPageData }
) {
  const liveData = useQuery(api.rulesets.detailPageBySlug, { slug });
  const normalized: RulesetDetailPageData | null | undefined =
    liveData === undefined
      ? undefined
      : liveData === null
        ? null
        : {
            ruleset: toRulesetEntry(liveData.ruleset),
            factions: liveData.factions,
            canAccess: liveData.canAccess,
            owner: liveData.owner,
            viewerAssignableMemberships: mapViewerAssignableMembershipsFromConvex(
              liveData.viewerAssignableMemberships as AssignableMembershipConvexRow[] | null
            ),
            groupAccess: liveData.groupAccess,
            faqItems: mapFaqItemsFromConvex(liveData.faqItems as FaqItemConvexRow[]),
          };
  const result = toLiveQueryResult(normalized, true, () => options?.initialData);
  return {
    ...result,
    ruleset: result.data?.ruleset,
    factions: result.data?.factions,
    canAccess: result.data?.canAccess ?? false,
    owner: result.data?.owner ?? null,
    viewerAssignableMemberships: result.data?.viewerAssignableMemberships ?? null,
    groupAccess: result.data?.groupAccess ?? null,
    faqItems: result.data?.faqItems ?? [],
  };
}

export function useRulesetFactions(rulesetId: string) {
  const liveData = useQuery(api.rulesets.factionIds, { ruleset_id: rulesetId } as never) as
    | string[]
    | undefined;
  return toLiveQueryResult(liveData, true);
}

export function useRulesetFactionsWithDetails(
  rulesetId: string,
  options?: { initialData?: { factionId: string; name: string; urlSlug: string }[] }
) {
  const liveData = useQuery(api.rulesets.factionDetails, { ruleset_id: rulesetId } as never) as
    | { factionId: string; name: string; urlSlug: string }[]
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data,
  };
}

export function useRulesetsByFaction(
  factionRowId: string,
  options?: { initialData?: RulesetEntry[] }
) {
  const liveData = useQuery(api.rulesets.listByFaction, {
    faction_id: factionRowId,
  } as never) as RulesetRow[] | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map(toRulesetEntry),
  };
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
