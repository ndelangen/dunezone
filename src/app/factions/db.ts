import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import type { LiveQueryResult } from '@app/db/core/live';
import { CanonicalFactionStoredSchema, FactionInputSchema } from '@game/schema/faction';
import type { FactionInput } from '@game/schema/faction';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { PublicAssetPublishingStatusProjection } from '../../../convex/assetPublishingStatus';
import type {
  AssignedGroupSummary,
  CollaborativeAccess,
} from '../../../convex/lib/collaborativeAccess';

export type Faction = FactionInput;
export type FactionData = FactionInput;
export type FactionRow = Doc<'factions'>;
export type FactionEntry = Omit<FactionRow, 'data'> & {
  data: FactionData;
};

export type FactionRulesetSummary = {
  id: Doc<'rulesets'>['_id'];
  slug: string;
  name: string;
};

export type FactionCatalogueEntry = FactionEntry & {
  rulesets: FactionRulesetSummary[];
};

export type FactionCatalogueSpotlightData = {
  slug: FactionCatalogueEntry['slug'];
  data: Pick<FactionCatalogueEntry['data'], 'name' | 'logo' | 'background'>;
};

export type FactionCatalogueRow = FactionRow & {
  rulesets: FactionRulesetSummary[];
};

export type FactionCataloguePageData = {
  factions: FactionCatalogueEntry[];
  rulesets: FactionRulesetSummary[];
  spotlights: {
    newArrival: FactionCatalogueEntry | null;
    freshlyUpdated: FactionCatalogueEntry | null;
  };
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
    data: CanonicalFactionStoredSchema.parse(entry.data),
  };
}

function toFactionCatalogueEntry(entry: FactionCatalogueRow): FactionCatalogueEntry {
  return {
    ...entry,
    data: CanonicalFactionStoredSchema.parse(entry.data),
  };
}

/** Normalize catalogue rows returned by either side of the background migration. */
export function factionCatalogueRowsToEntries(
  rows: FactionCatalogueRow[]
): FactionCatalogueEntry[] {
  return rows.map(toFactionCatalogueEntry);
}

function toFactionCataloguePageData(raw: {
  factions: FactionCatalogueRow[];
  rulesets: FactionRulesetSummary[];
  spotlights: {
    newArrival: FactionCatalogueRow | null;
    freshlyUpdated: FactionCatalogueRow | null;
  };
}): FactionCataloguePageData {
  return {
    factions: factionCatalogueRowsToEntries(raw.factions),
    rulesets: raw.rulesets,
    spotlights: {
      newArrival: raw.spotlights.newArrival
        ? toFactionCatalogueEntry(raw.spotlights.newArrival)
        : null,
      freshlyUpdated: raw.spotlights.freshlyUpdated
        ? toFactionCatalogueEntry(raw.spotlights.freshlyUpdated)
        : null,
    },
  };
}

/** Parse Convex faction rows into typed entries (shared by loaders and group detail). */
export function factionRowsToEntries(rows: FactionRow[]): FactionEntry[] {
  return rows.map(toFactionEntry);
}

export type FactionDetailPageData = {
  faction: FactionEntry;
  owner: Doc<'profiles'>;
  assetPublishing: PublicAssetPublishingStatusProjection;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'faction' }>;
  assignableGroups: AssignedGroupSummary[];
  rulesets: FactionRulesetSummary[];
};

function toFactionDetailPageData(
  raw: FunctionReturnType<typeof api.factions.getBySlug>
): FactionDetailPageData {
  return {
    faction: {
      ...raw.faction,
      data: CanonicalFactionStoredSchema.parse(raw.faction.data),
    },
    owner: raw.owner,
    assetPublishing: raw.assetPublishing,
    viewerAccess: raw.viewerAccess,
    assignableGroups: raw.assignableGroups,
    rulesets: raw.rulesets,
  };
}

export async function loadFactionBySlug(slug: string): Promise<FactionDetailPageData> {
  return await loadFaction(slug);
}

export async function loadFactionsAll(): Promise<FactionEntry[]> {
  const entries = await db.query(api.factions.list, {});
  return factionRowsToEntries(entries);
}

export async function loadFactionCataloguePage(): Promise<FactionCataloguePageData> {
  const raw = await db.query(api.factions.cataloguePage, {});
  return toFactionCataloguePageData(raw);
}

export async function loadFactionsByOwner(ownerId: string): Promise<FactionEntry[]> {
  const entries = await db.query(api.factions.listByOwner, {
    owner_id: ownerId as Id<'users'>,
  });
  return factionRowsToEntries(entries);
}

export async function loadFactionsByGroup(groupId: string): Promise<FactionEntry[]> {
  const entries = await db.query(api.factions.listByGroup, {
    group_id: groupId as Id<'groups'>,
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
  const normalized = liveData ? toFactionDetailPageData(liveData) : undefined;
  const result = toLiveQueryResult(normalized, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    faction: result.data?.faction,
    owner: result.data?.owner,
    viewerAccess: result.data?.viewerAccess,
    assignableGroups: result.data?.assignableGroups ?? [],
    rulesets: result.data?.rulesets ?? [],
    assetPublishing: result.data?.assetPublishing ?? {
      status: null,
      captureStatus: null,
      publicationHref: null,
      lastPublishedAt: null,
    },
  };
}

export function useFactionsAll(options?: { initialData?: FactionEntry[] }) {
  const liveData = useQuery(api.factions.list, {});
  const normalized = liveData ? factionRowsToEntries(liveData) : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData ?? undefined);
}

export function useFactionCataloguePage(options?: { initialData?: FactionCataloguePageData }) {
  const liveData = useQuery(api.factions.cataloguePage, {});
  const normalized = liveData ? toFactionCataloguePageData(liveData) : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData);
}

/**
 * Normalized row from `api.factions.listForLoadPicker` (group label + owner username resolved
 * server-side).
 */
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
  const normalized = liveData
    ? {
        rows: liveData.rows.map((row) => ({
          ...row,
          data: CanonicalFactionStoredSchema.parse(row.data),
        })),
        memberGroupIds: liveData.memberGroupIds,
      }
    : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData ?? undefined);
}

export function useFactionsByOwner(ownerId: string, options?: { initialData?: FactionEntry[] }) {
  const liveData = useQuery(api.factions.listByOwner, {
    owner_id: ownerId,
  } as never);
  const normalized = liveData ? factionRowsToEntries(liveData) : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData ?? undefined);
}

export function useFactionsByGroup(groupId: string, options?: { initialData?: FactionEntry[] }) {
  const liveData = useQuery(api.factions.listByGroup, {
    group_id: groupId,
  } as never);
  const normalized = liveData ? factionRowsToEntries(liveData) : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData ?? undefined);
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
        {
          id: variables.id,
          data: FactionInputSchema.parse(variables.input),
        },
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
      const entry = await mutation.mutateAsync({
        id,
        group_id: groupId,
      });
      return toFactionEntry(entry);
    },
  };
}

export async function loadFaction(slug: string): Promise<FactionDetailPageData> {
  const raw = await db.query(api.factions.getBySlug, { slug });
  return toFactionDetailPageData(raw);
}
