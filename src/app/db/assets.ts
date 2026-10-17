import { assetSubjectFacts } from '@shared/access/collaborativeAccess';
import type { AssetViewerAccess } from '@shared/access/collaborativeAccess';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';
import { useAssetAccess, useViewerAssignableGroups, useViewerIsAdmin, UNAVAILABLE_SUBJECT } from '@app/db/viewerAccess';

import { api } from '../../../convex/_generated/api';
import type { AssignedGroupSummary } from '../../../convex/lib/collaborativeAccess';

export type AssetCataloguePageData = FunctionReturnType<typeof api.assets.cataloguePage>;
export type AssetListEntry = AssetCataloguePageData['recent'][number];

/** The asset landing route's loader, paired with `useAssetCataloguePage`. */
export async function loadAssetCataloguePage(): Promise<AssetCataloguePageData> {
  return await db.query(api.assets.cataloguePage, {});
}

/** The asset landing page, live, taking `loadAssetCataloguePage`'s result as `initialData`. */
export function useAssetCataloguePage(options?: { initialData?: AssetCataloguePageData }) {
  const liveData = useLiveQuery(api.assets.cataloguePage, {});
  return toLiveQueryResult(liveData, () => options?.initialData);
}

export type AssetsByTypesData = FunctionReturnType<typeof api.assets.listByTypes>;

/**
 * The picker's options read.
 * The browse page deliberately does not share it: a route holds one page query, and giving this one the browse tile's member previews would make every picker pay a relation pass per row for art it never draws.
 */
export function useAssetsByTypes(types: string[], options?: { initialData?: AssetsByTypesData }) {
  const liveData = useQuery(api.assets.listByTypes, { types });
  return toLiveQueryResult(liveData, () => options?.initialData);
}

export type AssetBrowsePageData = FunctionReturnType<typeof api.assets.browsePage>;
export type AssetBrowseEntry = AssetBrowsePageData['entries'][number];

/** One asset type's browse route loader. There is no live twin: the browse page reads once and filters in the client. */
export async function loadAssetBrowsePage(type: string): Promise<AssetBrowsePageData> {
  return await db.query(api.assets.browsePage, { type });
}

/** The browse route's one page query. Search and sort are URL state applied to what this returns, so neither re-fetches. */
export function useAssetBrowsePage(type: string, options?: { initialData?: AssetBrowsePageData }) {
  const liveData = useLiveQuery(api.assets.browsePage, { type });
  return toLiveQueryResult(liveData, () => options?.initialData);
}

/**
 * Creates an asset of a given type.
 * Unlike the faction and ruleset mutations, this is the raw live mutation: it takes the Convex argument names and sends `data` through untouched.
 * The authoritative parse is the Convex handler's, per the validation standard in `docs/data-layer.md`, so a draft the schema rejects fails at the round trip rather than at this call.
 */
export function useCreateAsset() {
  return useLiveMutation<
    { type: string; data: unknown; members_from?: AssetListEntry['id'] },
    { id: string; slug: string }
  >(api.assets.create);
}

/** What `api.assets.page` gives a route: the same for every viewer, and what its loader seeds the live page with. */
export type AssetPublicPage = FunctionReturnType<typeof api.assets.page>;

/**
 * An asset's page as a route draws it: the public page combined with what this viewer may do.
 * `viewerResolved` is false while the viewer is on its way;
 * until then the capabilities are the anonymous ones, so no control appears before it may.
 */
export type AssetPageData =
  | (NonNullable<AssetPublicPage> & {
      viewerResolved: boolean;
      viewerAccess: AssetViewerAccess;
      assignableGroups: AssignedGroupSummary[];
      canConvertToCustom: boolean;
    })
  | null;

/** The asset detail route's loader, paired with `useAssetPage`; both need the type as well as the slug, since the slug is unique only within a type. */
export async function loadAssetPage(type: string, slug: string): Promise<AssetPublicPage> {
  return await db.query(api.assets.page, { type, slug });
}

/**
 * One asset's page, live, taking `loadAssetPage`'s result as `initialData`, combined with the viewer.
 * The page query is one cached answer for everyone;
 * the viewer half is the session, the viewer's membership of the asset's Group and the Groups they could move it into.
 */
export function useAssetPage(
  type: string,
  slug: string,
  options: { initialData: AssetPublicPage; embeddedTokenIds?: string[] }
): { data: AssetPageData; isPending: boolean } {
  const liveData = useLiveQuery(api.assets.page, {
    type,
    slug,
    ...(options.embeddedTokenIds ? { embeddedTokenIds: options.embeddedTokenIds as AssetListEntry['id'][] } : {}),
  });
  const page = liveData === undefined ? options.initialData : liveData;
  const { resolved, viewerAccess } = useAssetAccess(
    assetSubjectFacts(
      'asset',
      page ? { owner_id: page.ownerId, is_deleted: false } : UNAVAILABLE_SUBJECT,
      page?.assignedGroup ?? null
    )
  );
  const assignableGroups = useViewerAssignableGroups();
  const isAdmin = useViewerIsAdmin();
  return {
    isPending: liveData === undefined,
    data: page
      ? {
          ...page,
          viewerResolved: resolved,
          viewerAccess,
          assignableGroups,
          canConvertToCustom: page.convertibleToCustom && isAdmin,
        }
      : null,
  };
}

/** Saves an asset, on the same raw contract as `useCreateAsset`: Convex argument names, and a `data` the handler parses rather than this hook. */
export function useUpdateAsset() {
  return useLiveMutation<{ id: AssetListEntry['id']; data: unknown }, { id: string; slug: string }>(api.assets.update);
}

/** Soft-deletes an asset by id. */
export function useDeleteAsset() {
  return useLiveMutation<{ id: AssetListEntry['id'] }, void>(api.assets.softDelete);
}

/** Moves an asset into a Group, or out of every Group with `group_id: null`. Snake_case here, because this hook does not wrap the mutation. */
export function useSetAssetGroup() {
  return useLiveMutation<{ id: AssetListEntry['id']; group_id: string | null }, void>(api.assets.setGroup);
}

/** How many of one member a container holds. Zero removes it. Serves decks and bundles alike. */
export function useSetMemberCount() {
  return useLiveMutation<{ container_id: AssetListEntry['id']; member_id: AssetListEntry['id']; count: number }, void>(
    api.assets.setMemberCount
  );
}

/** The create page holds this read while its current draft embeds tokens. */
export function useCustomCardTokens(ids: string[]) {
  return useQuery(api.assets.customCardTokens, { ids: ids as AssetListEntry['id'][] });
}

/** Changes a treachery card into editable custom-card layers without creating another asset. */
export function useConvertTreacheryToCustom() {
  return useLiveMutation<{ id: AssetListEntry['id'] }, { id: string; slug: string }>(
    api.assets.convertTreacheryToCustom
  );
}
