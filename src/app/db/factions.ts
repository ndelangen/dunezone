import { recalculateFactionComplexity } from '@shared/factions/complexity';
import {
  CanonicalFactionClientSchema,
  CatalogueFactionClientSchema,
  FactionInputSchema,
} from '@shared/factions/schema';
import type { CatalogueFactionData } from '@shared/factions/schema';
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

/**
 * The authored faction blob, as the editor and the mutations speak it.
 * `FactionData` is the same type under the name the row's `data` field uses;
 * both are `FactionInput` and neither is narrower.
 */
export type Faction = FactionInput;

/** `Faction` under the name a row's `data` field wears. Identical type; the two names exist so a call site can read either way. */
export type FactionData = FactionInput;

/** A faction straight from Convex, `data` still unparsed. Pass it through `factionRowsToEntries` before reading fields off it. */
export type FactionRow = Doc<'factions'>;
/**
 * A faction row whose `data` has been parsed at the client boundary, which is what pages render.
 * Reach for `FactionCatalogueEntry` instead when you only need the fields a card draws;
 * it comes from a different query.
 */
export type FactionEntry = Omit<FactionRow, 'data'> & {
  data: FactionData;
};

export type FactionRulesetSummary = {
  id: Doc<'rulesets'>['_id'];
  slug: string;
  name: string;
};

/* Reaching for a dropped field must fail to compile. It typed as `unknown` until the catalogue data type
   was inferred from the strict schema instead of the loose one, so this pins which side it comes from. */
// @ts-expect-error `rules` is not on a catalogue row
type _CatalogueDataIsExact = FactionCatalogueEntry['data']['rules'];

/**
 * A catalogue-shaped faction: the fields `FactionCard` draws, not a whole faction (#642).
 * Reach for `FactionEntry` when you need the authored blob;
 * it arrives from `factions.getBySlug`, a different contract.
 */
export type FactionCatalogueEntry = Omit<FactionCatalogueRow, 'data'> & {
  data: CatalogueFactionData;
};

export type FactionCatalogueSpotlightData = {
  slug: FactionCatalogueEntry['slug'];
  data: Pick<FactionCatalogueEntry['data'], 'name' | 'logo' | 'background'>;
};

/** Derived from the query's own return type, so the client never claims a field the server stopped sending. */
export type FactionCatalogueRow = FunctionReturnType<typeof api.factions.cataloguePage>['factions'][number];

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

/** What `useCreateFaction` hands back: a `FactionEntry` plus the `route_notice` the create mutation returns for the redirect. */
export type CreatedFactionEntry = ReturnType<typeof toCreatedFactionEntry>;

function toFactionCatalogueEntry(entry: FactionCatalogueRow): FactionCatalogueEntry {
  return {
    ...entry,
    data: parseClientBoundary(CatalogueFactionClientSchema, entry.data, 'Faction data'),
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

/**
 * `loadFaction` under an older name, returning its result unchanged.
 * The app's own faction routes call `loadFaction`;
 * this name survives on the sheet preview route alone.
 */
export async function loadFactionBySlug(slug: string): Promise<FactionDetailPageData> {
  return await loadFaction(slug);
}

/** The catalogue route's loader, paired with `useFactionCataloguePage` the same way. */
export async function loadFactionCataloguePage(): Promise<FactionCataloguePageData> {
  const raw = await db.query(api.factions.cataloguePage, {});
  return toFactionCataloguePageData(raw);
}

/**
 * The save guard's slug rule as a live subscription, for the faction editor's name-conflict warning.
 * Always real args: the caller mounts and unmounts the probe holding this, which is how a domain read stays conditional without a skip.
 */
export function useFactionSlugTaken(args: { slug: string }) {
  return useQuery(api.factions.slugTaken, args);
}

/**
 * The live faction behind a slug, for the detail and edit routes.
 * Pass the route loader's `loadFaction` result as `initialData`;
 * without it the first render has no faction and the page flashes its pending frame.
 */
export function useFaction(
  slug: string,
  options?: {
    initialData?: FactionDetailPageData;
  }
) {
  const liveData = useQuery(api.factions.getBySlug, { slug });
  const normalized = liveData ? toFactionDetailPageData(liveData) : undefined;
  const result = toLiveQueryResult(normalized, () => options?.initialData ?? undefined);
  return result;
}

/** The live catalogue, taking `loadFactionCataloguePage`'s result as `initialData`. */
export function useFactionCataloguePage(options?: { initialData?: FactionCataloguePageData }) {
  const liveData = useQuery(api.factions.cataloguePage, {});
  const normalized = liveData ? toFactionCataloguePageData(liveData) : undefined;
  return toLiveQueryResult(normalized, () => options?.initialData);
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

/**
 * What the load picker needs in one query: the rows it lists, and the Groups the viewer belongs to.
 * `memberGroupIds` is separate because the picker marks a row as reachable by membership, which no field on the row itself can say.
 */
export type FactionLoadPickerPayload = {
  rows: FactionLoadPickerRow[];
  memberGroupIds: Doc<'groups'>['_id'][];
};

/** Every faction the viewer may load into the editor, for the editor's own picker. */
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
  return toLiveQueryResult(normalized, () => options?.initialData ?? undefined);
}

/**
 * Creates a faction from an editor draft.
 * `mutate({ input, groupId })`, and `onSuccess` receives a `CreatedFactionEntry` carrying the `route_notice` the redirect needs.
 * The input is recalculated for complexity and re-parsed through `FactionInputSchema` on the way out, so a caller hands over its draft rather than a finished payload.
 */
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

/**
 * Saves an edited faction.
 * `mutate({ input, id })`, normalizing the input the same way `useCreateFaction` does, and `onSuccess` receives the parsed `FactionEntry`.
 */
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

/** Soft-deletes a faction by id. The row stays and stops being served, so nothing here needs the slug. */
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

/** Moves a faction into a Group, or out of every Group with `groupId: null`. Used by both the faction page and the Group detail page's picker. */
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

/** The faction detail route's loader. Hand its result to `useFaction` as `initialData` so the first paint has data and later renders are live. */
export async function loadFaction(slug: string): Promise<FactionDetailPageData> {
  const raw = await db.query(api.factions.getBySlug, { slug });
  return toFactionDetailPageData(raw);
}

/** Factions the viewer owns, for the Group detail page's "add a faction" picker. */
export function useFactionsOwnedForGroupAssign() {
  const liveData = useQuery(api.factions.listOwnedForGroupAssign, {});
  return toLiveQueryResult(liveData);
}
