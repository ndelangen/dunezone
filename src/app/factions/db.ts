import { useQuery } from 'convex/react';

import { db } from '@db/core';
import { type LiveQueryResult, toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import { type FactionInput, FactionInputSchema } from '@game/schema/faction';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { PublicAssetPublishingStatusProjection } from '../../../convex/assetPublishingStatus';

export type Faction = FactionInput;
export type FactionData = FactionInput;
export type FactionRow = Doc<'factions'>;
export type FactionEntry = Omit<FactionRow, 'data'> & {
  data: FactionData;
};

export type FactionInsert = Omit<FactionEntry, 'data'> & {
  data: FactionData;
};
export type FactionUpdate = Omit<Partial<FactionEntry>, 'data'> & {
  data?: FactionData;
};

function toFactionEntry(entry: FactionRow): FactionEntry {
  return {
    ...entry,
    data: FactionInputSchema.parse(entry.data),
  };
}

/** Parse Convex faction rows into typed entries (shared by loaders and group detail). */
export function factionRowsToEntries(rows: FactionRow[]): FactionEntry[] {
  return rows.map(toFactionEntry);
}

/** Assigned group + members (profile summaries) for faction detail; mirrors ruleset `groupAccess`. */
export type FactionPageGroupAccess = {
  group: Doc<'groups'>;
  members: Array<{
    membership: Doc<'group_members'>;
    profile: {
      id: string;
      slug: string;
      username: string | null;
      avatar_url: string | null;
    } | null;
  }>;
};

export type FactionDetailPageData = {
  faction: FactionEntry;
  owner: Doc<'profiles'>;
  group: Doc<'groups'> | null;
  memberships: Doc<'group_members'>[];
  groups: Doc<'groups'>[];
  groupAccess: FactionPageGroupAccess | null;
  assetPublishing: PublicAssetPublishingStatusProjection;
};

export async function loadFactionBySlug(slug: string): Promise<FactionDetailPageData> {
  return await loadFaction(slug);
}

export async function loadFactionsAll(): Promise<FactionEntry[]> {
  const entries = await db.query<FactionRow[]>(api.factions.list, {});
  return factionRowsToEntries(entries);
}

export async function loadFactionsByOwner(ownerId: string): Promise<FactionEntry[]> {
  const entries = await db.query<FactionRow[]>(api.factions.listByOwner, { owner_id: ownerId });
  return factionRowsToEntries(entries);
}

export async function loadFactionsByGroup(groupId: string): Promise<FactionEntry[]> {
  const entries = await db.query<FactionRow[]>(api.factions.listByGroup, {
    group_id: groupId,
  });
  return factionRowsToEntries(entries);
}

export function useFaction(
  slug: string,
  options?: {
    initialData?: FactionDetailPageData;
  }
) {
  const liveData = useQuery(api.factions.getBySlug, { slug });
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    faction: result.data ? toFactionEntry(result.data.faction) : undefined,
    owner: result.data?.owner,
    group: result.data?.group,
    memberships: result.data?.memberships,
    groups: result.data?.groups,
    groupAccess: result.data?.groupAccess ?? null,
    assetPublishing: result.data?.assetPublishing ?? { status: null, publicationHref: null },
  };
}

export function useFactionsAll(options?: { initialData?: FactionEntry[] }) {
  const liveData = useQuery(api.factions.list, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data ? factionRowsToEntries(result.data) : undefined,
  };
}

/** Normalized row from `api.factions.listForLoadPicker` (group label + owner username resolved server-side). */
export type FactionLoadPickerRow = {
  id: FactionRow['_id'];
  slug: FactionRow['slug'];
  data: FactionData;
  groupId: FactionRow['group_id'];
  groupLabel: string;
  ownerId: FactionRow['owner_id'];
  ownerUsername: string | null;
};

export type FactionLoadPickerPayload = {
  rows: FactionLoadPickerRow[];
  memberGroupIds: Doc<'groups'>['_id'][];
};

export type FactionLoadPickerQuery = LiveQueryResult<FactionLoadPickerPayload>;

export function useFactionLoadPicker(options?: { initialData?: FactionLoadPickerPayload }) {
  const liveData = useQuery(api.factions.listForLoadPicker, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data
      ? {
          rows: result.data.rows.map((row) => ({
            ...row,
            data: FactionInputSchema.parse(row.data),
          })),
          memberGroupIds: result.data.memberGroupIds,
        }
      : undefined,
  };
}

export function useFactionsByOwner(ownerId: string, options?: { initialData?: FactionEntry[] }) {
  const liveData = useQuery(api.factions.listByOwner, { owner_id: ownerId } as never);
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data ? factionRowsToEntries(result.data) : undefined,
  };
}

export function useFactionsByGroup(groupId: string, options?: { initialData?: FactionEntry[] }) {
  const liveData = useQuery(api.factions.listByGroup, { group_id: groupId } as never);
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data ? factionRowsToEntries(result.data) : undefined,
  };
}

export function useCreateFaction() {
  const mutation = useLiveMutation<{ data: Faction; group_id: string | null }, FactionRow>(
    api.factions.create
  );

  return {
    ...mutation,
    mutate: (
      variables: { input: Faction; groupId?: string | null },
      options?: { onSuccess?: (faction: FactionEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        {
          data: FactionInputSchema.parse(variables.input),
          group_id: variables.groupId ?? null,
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(toFactionEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ input, groupId }: { input: Faction; groupId?: string | null }) => {
      const validatedData = FactionInputSchema.parse(input);
      const entry = await mutation.mutateAsync({
        data: validatedData,
        group_id: groupId ?? null,
      });
      return toFactionEntry(entry);
    },
  };
}

export function useUpdateFaction() {
  const mutation = useLiveMutation<{ id: string; data: Faction }, FactionRow>(api.factions.update);

  return {
    ...mutation,
    mutate: (
      variables: { input: Faction; id: string; previousUrlSlug?: string },
      options?: { onSuccess?: (entry: FactionEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id, data: FactionInputSchema.parse(variables.input) },
        {
          onSuccess: (entry) => options?.onSuccess?.(toFactionEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({
      input,
      id,
    }: {
      input: Faction;
      id: string;
      previousUrlSlug?: string;
    }) => {
      const validatedData = FactionInputSchema.parse(input);
      const entry = await mutation.mutateAsync({
        id,
        data: validatedData,
      });
      return toFactionEntry(entry);
    },
  };
}

export function useDeleteFaction() {
  const mutation = useLiveMutation<{ id: string }, void>(api.factions.softDelete);
  return {
    ...mutation,
    mutate: (
      variables: { id: string; urlSlug?: string },
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id },
        {
          onSuccess: () => options?.onSuccess?.(),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ id }: { id: string; urlSlug?: string }) =>
      await mutation.mutateAsync({ id }),
  };
}

export function useSetFactionGroup() {
  const mutation = useLiveMutation<{ id: string; group_id: string | null }, FactionRow>(
    api.factions.setGroup
  );
  return {
    ...mutation,
    mutate: (
      variables: { id: string; groupId: string | null },
      options?: { onSuccess?: (entry: FactionEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id, group_id: variables.groupId },
        {
          onSuccess: (entry) => options?.onSuccess?.(toFactionEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ id, groupId }: { id: string; groupId: string | null }) => {
      const entry = await mutation.mutateAsync({ id, group_id: groupId });
      return toFactionEntry(entry);
    },
  };
}

export type FactionCreatePageData = {
  ownerProfile: Doc<'profiles'> | null;
  groups: Doc<'groups'>[];
  memberships: Doc<'group_members'>[];
};

export async function loadFaction(slug: string): Promise<FactionDetailPageData> {
  return await db.query<FactionDetailPageData>(api.factions.getBySlug, {
    slug,
  });
}

export async function loadFactionCreatePageContext(): Promise<FactionCreatePageData> {
  return await db.query<FactionCreatePageData>(api.factions.getCreatePageContext, {});
}

export function useFactionCreatePageContext(options?: { initialData?: FactionCreatePageData }) {
  const liveData = useQuery(api.factions.getCreatePageContext, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
  };
}
