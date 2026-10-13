import { groupRosterCapabilities } from '@shared/access/collaborativeAccess';
import type { GroupViewerAccess } from '@shared/access/collaborativeAccess';
import { groupInputSchema } from '@shared/groups/validation';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { factionRowsToEntries } from '@db/factions';
import type { FactionEntry } from '@db/factions';
import { rulesetRowsToEntries } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';
import { useGroupAccess } from '@app/db/viewerAccess';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary, GroupRosterMember, MembershipState } from '../../../convex/lib/collaborativeAccess';
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
/** What `api.groups.detailPage` gives the group pages, the same for every viewer: the group, everything assigned to it, and the roster. */
export type GroupPublicPage = {
  group: GroupEntry;
  factions: FactionEntry[];
  rulesets: RulesetEntry[];
  owner: ProfileSummary | null;
  roster: GroupRosterMember[];
};

/** One roster member as the page draws it: the public member plus what this viewer may do to that membership. */
type GroupRosterRow = GroupRosterMember & { capabilities: ReturnType<typeof groupRosterCapabilities> };

/**
 * The group page as the route draws it: the public page combined with what this viewer may do.
 * `viewerResolved` is false while the viewer is on its way;
 * until then the capabilities are the anonymous ones.
 */
export type GroupDetailPageData = Omit<GroupPublicPage, 'roster'> & {
  viewerResolved: boolean;
  viewerAccess: GroupViewerAccess;
  roster: GroupRosterRow[];
};

/** The one field the edit route's loader needs, from the same public page the group page reads. */
type GroupEditPublicPage = Pick<GroupPublicPage, 'group'>;

type GroupDetailPageRaw = FunctionReturnType<typeof api.groups.detailPage>;

/** The group page's loader, paired with `useGroupDetailBySlug`. */
export async function loadGroupDetailBySlug(slug: string): Promise<GroupPublicPage> {
  const result = await db.query(api.groups.detailPage, { slug });
  return normalizeGroupDetailFromConvex(result);
}

/** The edit route's loader. Runs the detail query and keeps the group, so it is not the cheaper call its narrower return suggests. */
export async function loadGroupEditBySlug(slug: string): Promise<GroupEditPublicPage> {
  const result = await loadGroupDetailBySlug(slug);
  return { group: result.group };
}

function toGroupEntry(row: GroupRow): GroupEntry {
  return { ...row, id: row._id };
}

function normalizeGroupDetailFromConvex(raw: GroupDetailPageRaw): GroupPublicPage {
  return {
    group: toGroupEntry(raw.group),
    factions: factionRowsToEntries(raw.factions),
    rulesets: rulesetRowsToEntries(raw.rulesets),
    owner: raw.owner,
    roster: raw.roster,
  };
}

/** The live public page, taking a loader's result as `initialData`. */
function useGroupPublicPage(slug: string, initialData: GroupPublicPage | undefined) {
  const liveData = useLiveQuery(api.groups.detailPage, { slug });
  const normalizedLive = liveData ? normalizeGroupDetailFromConvex(liveData) : undefined;
  return toLiveQueryResult<GroupPublicPage | undefined>(normalizedLive, () => initialData);
}

/**
 * The group page's live data, taking `loadGroupDetailBySlug`'s result as `initialData`, combined with the viewer.
 * The page query is one cached answer for everyone;
 * the viewer half is the session and the viewer's membership of this Group.
 */
export function useGroupDetailBySlug(slug: string, options?: { initialData?: GroupPublicPage }) {
  const result = useGroupPublicPage(slug, options?.initialData);
  const page = result.data;
  const { resolved, viewerAccess } = useGroupAccess(page?.group ?? null);
  const data: GroupDetailPageData | undefined = page
    ? {
        ...page,
        viewerResolved: resolved,
        viewerAccess,
        roster: page.roster.map((member) => ({
          ...member,
          capabilities: groupRosterCapabilities(viewerAccess, member),
        })),
      }
    : undefined;
  return { ...result, data };
}

/** The edit route's live data. Subscribes to the same public page as the group page and combines its group with the viewer. */
export function useGroupEditBySlug(slug: string, options?: { initialData?: GroupEditPublicPage }) {
  const liveData = useLiveQuery(api.groups.detailPage, { slug });
  const liveGroup: GroupEntry | undefined = liveData ? toGroupEntry(liveData.group) : undefined;
  const result = toLiveQueryResult(liveGroup, () => options?.initialData?.group);
  const group = result.data;
  const { resolved, viewerAccess } = useGroupAccess(group ?? null);
  return { ...result, data: group ? { group, viewerResolved: resolved, viewerAccess } : undefined };
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
