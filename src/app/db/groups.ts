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

/** A group straight from Convex. `GroupEntry` is the same row with an `id` alias, which is what pages take. */
export type GroupRow = Doc<'groups'>;
/** A group row carrying `id` beside `_id`, so a caller spells it the way every other entry in this layer does. */
export type GroupEntry = GroupRow & { id: GroupRow['_id'] };
/** What `api.groups.detailBySlug` gives the group page: the group, everything assigned to it, the roster, and the viewer's access. */
export type GroupDetailPageData = {
  group: GroupEntry;
  factions: FactionEntry[];
  rulesets: RulesetEntry[];
  owner: ProfileSummary | null;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'group' }>;
  roster: GroupRosterEntry[];
};

/** The two fields the edit route needs. It still costs a full detail query, because that query is the only source. */
export type GroupEditPageData = Pick<GroupDetailPageData, 'group' | 'viewerAccess'>;

type GroupDetailPageRaw = FunctionReturnType<typeof api.groups.detailBySlug>;

/** The group page's loader, paired with `useGroupDetailBySlug`. */
export async function loadGroupDetailBySlug(slug: string): Promise<GroupDetailPageData> {
  const result = await db.query(api.groups.detailBySlug, { slug });
  return normalizeGroupDetailFromConvex(result);
}

/** The edit route's loader. Runs the detail query and keeps two fields of it, so it is not the cheaper call its narrower return suggests. */
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

/** The group page's live query, taking `loadGroupDetailBySlug`'s result as `initialData`. */
export function useGroupDetailBySlug(slug: string, options?: { initialData?: GroupDetailPageData }) {
  const liveData = useQuery(api.groups.detailBySlug, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  const result = toLiveQueryResult<GroupDetailPageData | undefined>(normalizedLive, () => options?.initialData);
  return result;
}

/** The edit route's live query. Subscribes to the same detail query as the page and narrows the result. */
export function useGroupEditBySlug(slug: string, options?: { initialData?: GroupEditPageData }) {
  const liveData = useQuery(api.groups.detailBySlug, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  const editData = normalizedLive
    ? { group: normalizedLive.group, viewerAccess: normalizedLive.viewerAccess }
    : undefined;
  const result = toLiveQueryResult<GroupEditPageData | undefined>(editData, () => options?.initialData);
  return result;
}

/** Creates a group from a name. The name is parsed before it is sent, so a caller passes what the field holds. */
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

/** Soft-deletes a group by id. */
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

/** Renames a group, parsing the name the way `useCreateGroup` does. */
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
