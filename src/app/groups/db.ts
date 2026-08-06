import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { factionRowsToEntries } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { rulesetRowsToEntries } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import { groupInputSchema } from '@app/groups/validation';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type {
  CollaborativeAccess,
  GroupRosterEntry,
} from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

export type GroupRow = Doc<'groups'>;
export type GroupEntry = GroupRow & { id: GroupRow['_id'] };
export type GroupInsert = GroupEntry;
export type GroupUpdate = Partial<GroupEntry>;

export type GroupOwnerSummary = ProfileSummary;

export type GroupDetailPageData = {
  group: GroupEntry;
  factions: FactionEntry[];
  rulesets: RulesetEntry[];
  owner: GroupOwnerSummary | null;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'group' }>;
  roster: GroupRosterEntry[];
};

export type GroupEditPageData = Pick<GroupDetailPageData, 'group' | 'viewerAccess'>;

type GroupDetailPageRaw = FunctionReturnType<typeof api.groups.detailBySlug>;

export async function loadGroupDetailBySlug(slug: string): Promise<GroupDetailPageData> {
  const result = await db.query(api.groups.detailBySlug, { slug });
  return normalizeGroupDetailFromConvex(result);
}

export async function loadGroupEditBySlug(slug: string): Promise<GroupEditPageData> {
  const result = await loadGroupDetailBySlug(slug);
  return { group: result.group, viewerAccess: result.viewerAccess };
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

function normalizeGroupDetailFromConvex(raw: GroupDetailPageRaw): GroupDetailPageData {
  return {
    group: { ...raw.group, id: raw.group._id },
    factions: factionRowsToEntries(raw.factions),
    rulesets: rulesetRowsToEntries(raw.rulesets),
    owner: raw.owner,
    viewerAccess: raw.viewerAccess,
    roster: raw.roster,
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
    factions: result.data?.factions,
    rulesets: result.data?.rulesets,
    owner: result.data?.owner ?? null,
    viewerAccess: result.data?.viewerAccess,
    roster: result.data?.roster,
  };
}

export function useGroupEditBySlug(slug: string, options?: { initialData?: GroupEditPageData }) {
  const liveData = useQuery(api.groups.detailBySlug, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  const editData = normalizedLive
    ? { group: normalizedLive.group, viewerAccess: normalizedLive.viewerAccess }
    : undefined;
  const result = toLiveQueryResult<GroupEditPageData | undefined>(
    editData,
    true,
    () => options?.initialData
  );
  return {
    ...result,
    group: result.data?.group,
    viewerAccess: result.data?.viewerAccess,
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
