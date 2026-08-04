import { useQuery } from 'convex/react';

import { db } from '@db/core';
import { factionRowsToEntries } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { rulesetRowsToEntries } from '@db/rulesets';
import type { RulesetEntry, RulesetRow } from '@db/rulesets';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import { groupInputSchema } from '@app/groups/validation';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type GroupRow = Doc<'groups'>;
export type GroupEntry = GroupRow & { id: GroupRow['_id'] };
export type GroupInsert = GroupEntry;
export type GroupUpdate = Partial<GroupEntry>;

export type GroupPageData = {
  group: GroupEntry;
  members: Doc<'group_members'>[];
};

export type GroupMemberWithId = Doc<'group_members'> & { id: Doc<'group_members'>['_id'] };

export type GroupDetailPageData = {
  group: GroupEntry;
  members: GroupMemberWithId[];
  factions: FactionEntry[];
  rulesets: RulesetEntry[];
  profiles: Doc<'profiles'>[];
};

export async function loadGroupDetailBySlug(slug: string): Promise<GroupDetailPageData> {
  const result = await db.query<{
    group: GroupRow;
    members: Doc<'group_members'>[];
    factions: Doc<'factions'>[];
    rulesets: RulesetRow[];
    profiles: Doc<'profiles'>[];
  }>(api.groups.detailBySlug, { slug });
  return {
    group: { ...result.group, id: result.group._id },
    members: result.members.map((m) => ({ ...m, id: m._id })),
    factions: factionRowsToEntries(result.factions),
    rulesets: rulesetRowsToEntries(result.rulesets),
    profiles: result.profiles,
  };
}

export async function loadGroupBySlug(slug: string): Promise<GroupPageData> {
  const result = await db.query<{
    group: GroupRow;
    members: Doc<'group_members'>[];
  }>(api.groups.getBySlug, { slug });
  return {
    ...result,
    group: { ...result.group, id: result.group._id },
  };
}

/** Call only when `id` is a real group id (mount a child component if the id is optional). */
export function useGroup(id: string) {
  const liveData = useQuery(api.groups.getById, { id } as never) as GroupRow | undefined;
  const result = toLiveQueryResult(liveData, true);
  return {
    ...result,
    data: result.data ? { ...result.data, id: result.data._id } : undefined,
  };
}

export function useGroupBySlug(slug: string, options?: { initialData?: GroupPageData }) {
  const liveData = useQuery(api.groups.getBySlug, { slug });
  const result = toLiveQueryResult<{
    group: GroupRow;
    members: Doc<'group_members'>[];
  } | null>(liveData, true, () => (options?.initialData as never) ?? undefined);
  return {
    ...result,
    group: result.data
      ? ({ ...result.data.group, id: result.data.group._id } as GroupEntry)
      : undefined,
    members: result.data?.members,
  };
}

function normalizeGroupDetailFromConvex(raw: {
  group: GroupRow;
  members: Doc<'group_members'>[];
  factions: Doc<'factions'>[];
  rulesets: RulesetRow[];
  profiles: Doc<'profiles'>[];
}): GroupDetailPageData {
  return {
    group: { ...raw.group, id: raw.group._id },
    members: raw.members.map((m) => ({ ...m, id: m._id })),
    factions: factionRowsToEntries(raw.factions),
    rulesets: rulesetRowsToEntries(raw.rulesets),
    profiles: raw.profiles,
  };
}

export function useGroupDetailBySlug(
  slug: string,
  options?: { initialData?: GroupDetailPageData }
) {
  const liveData = useQuery(api.groups.detailBySlug, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  const result = toLiveQueryResult<GroupDetailPageData | undefined>(
    normalizedLive,
    true,
    () => options?.initialData
  );
  return {
    ...result,
    group: result.data?.group,
    members: result.data?.members,
    factions: result.data?.factions,
    rulesets: result.data?.rulesets,
    profiles: result.data?.profiles,
  };
}

export function useGroupsAll(options?: { initialData?: GroupEntry[] }) {
  const liveData = useQuery(api.groups.list, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map((entry) => ({ ...entry, id: entry._id })),
  };
}

/** Call only when `createdBy` is a real user id (e.g. mount a child after profile is known). */
export function useGroupsByCreator(createdBy: string) {
  const liveData = useQuery(api.groups.listByCreator, { created_by: createdBy } as never) as
    | GroupRow[]
    | undefined;
  const result = toLiveQueryResult(liveData, true);
  return {
    ...result,
    data: result.data?.map((entry) => ({ ...entry, id: entry._id })),
  };
}

export function useCreateGroup() {
  const mutation = useLiveMutation<{ name: string }, GroupRow>(api.groups.create);
  const parseGroupInput = (input: { name: string }) => {
    const parsed = groupInputSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid group input');
    }
    return parsed.data;
  };

  return {
    ...mutation,
    mutate: (
      variables: { input: { name: string } },
      options?: { onSuccess?: (group: GroupEntry) => void; onError?: (error: Error) => void }
    ) => {
      try {
        const parsed = parseGroupInput(variables.input);
        mutation.mutate(
          { name: parsed.name },
          {
            onSuccess: (group) => options?.onSuccess?.({ ...group, id: group._id }),
            onError: (error) => options?.onError?.(error),
          }
        );
      } catch (error) {
        options?.onError?.(error instanceof Error ? error : new Error('Invalid group input'));
      }
    },
    mutateAsync: async (variables: { input: { name: string } }) => {
      const parsed = parseGroupInput(variables.input);
      const group = await mutation.mutateAsync({
        name: parsed.name,
      });
      return { ...group, id: group._id };
    },
  };
}

export function useUpdateGroup() {
  const mutation = useLiveMutation<{ id: string; name: string }, GroupRow>(api.groups.update);

  return {
    ...mutation,
    mutate: (
      variables: { input: { name: string }; id: string },
      options?: { onSuccess?: (entry: GroupEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id, name: groupInputSchema.parse(variables.input).name },
        {
          onSuccess: (entry) => options?.onSuccess?.({ ...entry, id: entry._id }),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (variables: { input: { name: string }; id: string }) => {
      const group = await mutation.mutateAsync({
        id: variables.id,
        name: groupInputSchema.parse(variables.input).name,
      });
      return { ...group, id: group._id };
    },
  };
}

export function useDeleteGroup() {
  const mutation = useLiveMutation<{ id: string }, string>(api.groups.remove);
  return {
    ...mutation,
    mutate: (
      id: string,
      options?: { onSuccess?: (deletedId: string) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id },
        {
          onSuccess: (deletedId) => options?.onSuccess?.(deletedId),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (id: string) => await mutation.mutateAsync({ id }),
  };
}
