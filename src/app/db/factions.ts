import { recalculateFactionComplexity } from '@shared/factions/complexity';
import { CanonicalFactionClientSchema, FactionInputSchema } from '@shared/factions/schema';
import type { FactionInput } from '@shared/factions/schema';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { parseClientBoundary } from '@app/db/core/clientBoundary';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
/**
 * The app reaches Convex only through this layer, so the shapes it needs are re-exported here rather than imported from
 * `convex/` a second time.
 */
export type {
  PublicAssetCaptureStatus,
  PublicAssetPublishingStatus,
  PublicAssetPublishingStatusProjection,
} from '../../../convex/assetPublishingStatus';

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

function toFactionEntry(entry: FactionRow): FactionEntry {
  return {
    ...entry,
    data: parseClientBoundary(CanonicalFactionClientSchema, entry.data, 'Faction data'),
  };
}

function toCreatedFactionEntry(entry: FunctionReturnType<typeof api.factions.create>) {
  return {
    ...toFactionEntry(entry),
    route_notice: entry.route_notice,
  };
}

export type CreatedFactionEntry = ReturnType<typeof toCreatedFactionEntry>;

function toFactionCatalogueEntry(entry: FactionCatalogueRow): FactionCatalogueEntry {
  return {
    ...entry,
    data: parseClientBoundary(CanonicalFactionClientSchema, entry.data, 'Faction data'),
  };
}

/** Parse catalogue rows at the client boundary. */
export function factionCatalogueRowsToEntries(rows: FactionCatalogueRow[]): FactionCatalogueEntry[] {
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
      newArrival: raw.spotlights.newArrival ? toFactionCatalogueEntry(raw.spotlights.newArrival) : null,
      freshlyUpdated: raw.spotlights.freshlyUpdated ? toFactionCatalogueEntry(raw.spotlights.freshlyUpdated) : null,
    },
  };
}

/** Parse Convex faction rows into typed entries (shared by loaders and group detail). */
export function factionRowsToEntries(rows: FactionRow[]): FactionEntry[] {
  return rows.map(toFactionEntry);
}

type FactionDetailPageRaw = FunctionReturnType<typeof api.factions.getBySlug>;

export type FactionDetailPageData = Omit<FactionDetailPageRaw, 'faction'> & {
  faction: FactionEntry;
};

function toFactionDetailPageData(raw: FactionDetailPageRaw): FactionDetailPageData {
  return {
    faction: {
      ...raw.faction,
      data: parseClientBoundary(CanonicalFactionClientSchema, raw.faction.data, 'Faction data'),
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

export async function loadFactionCataloguePage(): Promise<FactionCataloguePageData> {
  const raw = await db.query(api.factions.cataloguePage, {});
  return toFactionCataloguePageData(raw);
}

/**
 * The save guard's slug rule as a live subscription, for the faction editor's name-conflict warning.
 * Always real args: the caller mounts and unmounts the probe holding this, which is how a domain read stays conditional without a skip.
 */
export function useFactionSlugTaken(args: { slug: string }) {
  return useQuery(api.factions.factionSlugTaken, args);
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
  return result;
}

export function useFactionCataloguePage(options?: { initialData?: FactionCataloguePageData }) {
  const liveData = useQuery(api.factions.cataloguePage, {});
  const normalized = liveData ? toFactionCataloguePageData(liveData) : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData);
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

export function useFactionLoadPicker(options?: { initialData?: FactionLoadPickerPayload }) {
  const liveData = useQuery(api.factions.listForLoadPicker, {});
  const normalized = liveData
    ? {
        rows: liveData.rows.map((row) => ({
          ...row,
          data: parseClientBoundary(CanonicalFactionClientSchema, row.data, 'Faction data'),
        })),
        memberGroupIds: liveData.memberGroupIds,
      }
    : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData ?? undefined);
}

export function useCreateFaction() {
  const mutation = useLiveMutation<
    { data: Faction; group_id?: string | null },
    FunctionReturnType<typeof api.factions.create>
  >(api.factions.create);

  return {
    ...mutation,
    mutate: (
      variables: { input: Faction; groupId?: string | null },
      options?: { onSuccess?: (faction: CreatedFactionEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        {
          data: FactionInputSchema.parse(recalculateFactionComplexity(variables.input)),
          ...(variables.groupId === undefined ? {} : { group_id: variables.groupId }),
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(toCreatedFactionEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ input, groupId }: { input: Faction; groupId?: string | null }) => {
      const validatedData = FactionInputSchema.parse(recalculateFactionComplexity(input));
      const entry = await mutation.mutateAsync({
        data: validatedData,
        ...(groupId === undefined ? {} : { group_id: groupId }),
      });
      return toCreatedFactionEntry(entry);
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
          data: FactionInputSchema.parse(recalculateFactionComplexity(variables.input)),
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(toFactionEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ input, id }: { input: Faction; id: string; previousUrlSlug?: string }) => {
      const validatedData = FactionInputSchema.parse(recalculateFactionComplexity(input));
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
    mutateAsync: async ({ id }: { id: string; urlSlug?: string }) => await mutation.mutateAsync({ id }),
  };
}

export function useSetFactionGroup() {
  const mutation = useLiveMutation<{ id: string; group_id: string | null }, FactionRow>(api.factions.setGroup);
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

/** Factions the viewer owns, for the Group detail page's "add a faction" picker. */
export function useFactionsOwnedForGroupAssign() {
  const liveData = useQuery(api.factions.listOwnedForGroupAssign, {});
  return toLiveQueryResult(liveData, true);
}
