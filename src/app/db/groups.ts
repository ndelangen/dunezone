import { groupInputSchema } from '@shared/groups/validation';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { factionRowsToEntries } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { rulesetRowsToEntries } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type {
  AssignedGroupSummary,
  CollaborativeAccess,
  GroupRosterEntry,
  MembershipState,
} from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

/**
 * The app reaches Convex only through this layer, so the shapes it needs are re-exported here rather than imported from
 * `convex/` a second time.
 */
export type { AssignedGroupSummary, MembershipState };

export type GroupRow = Doc<'groups'>;
export type GroupEntry = GroupRow & { id: GroupRow['_id'] };
export type GroupDetailPageData = {
  group: GroupEntry;
  factions: FactionEntry[];
  rulesets: RulesetEntry[];
  owner: ProfileSummary | null;
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

export function useGroupDetailBySlug(slug: string, options?: { initialData?: GroupDetailPageData }) {
  const liveData = useQuery(api.groups.detailBySlug, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  const result = toLiveQueryResult<GroupDetailPageData | undefined>(normalizedLive, true, () => options?.initialData);
  return result;
}

export function useGroupEditBySlug(slug: string, options?: { initialData?: GroupEditPageData }) {
  const liveData = useQuery(api.groups.detailBySlug, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  const editData = normalizedLive
    ? { group: normalizedLive.group, viewerAccess: normalizedLive.viewerAccess }
    : undefined;
  const result = toLiveQueryResult<GroupEditPageData | undefined>(editData, true, () => options?.initialData);
  return result;
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

export function useDeleteGroup() {
  const mutation = useLiveMutation<{ id: string }, string>(api.groups.softDelete);
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
