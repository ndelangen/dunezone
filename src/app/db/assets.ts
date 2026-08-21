import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type AssetCataloguePageData = FunctionReturnType<typeof api.assets.cataloguePage>;
export type AssetListEntry = AssetCataloguePageData['recent'][number];

export async function loadAssetCataloguePage(): Promise<AssetCataloguePageData> {
  return await db.query(api.assets.cataloguePage, {});
}

export function useAssetCataloguePage(options?: { initialData?: AssetCataloguePageData }) {
  const liveData = useQuery(api.assets.cataloguePage, {});
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}

export type AssetsByTypesData = FunctionReturnType<typeof api.assets.listByTypes>;

/**
 * The picker's options read.
 * The browse page deliberately does not share it: a route holds one page query, and giving this one the browse tile's member previews would make every picker pay a relation pass per row for art it never draws.
 */
export function useAssetsByTypes(types: string[], options?: { initialData?: AssetsByTypesData }) {
  const liveData = useQuery(api.assets.listByTypes, { types });
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}

export type AssetBrowsePageData = FunctionReturnType<typeof api.assets.browsePage>;
export type AssetBrowseEntry = AssetBrowsePageData['entries'][number];

export async function loadAssetBrowsePage(type: string): Promise<AssetBrowsePageData> {
  return await db.query(api.assets.browsePage, { type });
}

/** The browse route's one page query. Search and sort are URL state applied to what this returns, so neither re-fetches. */
export function useAssetBrowsePage(type: string, options?: { initialData?: AssetBrowsePageData }) {
  const liveData = useQuery(api.assets.browsePage, { type });
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}

export function useCreateAsset() {
  return useLiveMutation<{ type: string; data: unknown }, { id: string; slug: string }>(api.assets.create);
}

export type AssetPageData = FunctionReturnType<typeof api.assets.getPage>;

export async function loadAssetPage(type: string, slug: string): Promise<AssetPageData> {
  return await db.query(api.assets.getPage, { type, slug });
}

export function useAssetPage(type: string, slug: string, options?: { initialData?: AssetPageData }) {
  const liveData = useQuery(api.assets.getPage, { type, slug });
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}

export function useUpdateAsset() {
  return useLiveMutation<{ id: AssetListEntry['id']; data: unknown }, { id: string; slug: string }>(api.assets.update);
}

export function useDeleteAsset() {
  return useLiveMutation<{ id: AssetListEntry['id'] }, void>(api.assets.softDelete);
}

export function useSetAssetGroup() {
  return useLiveMutation<{ id: AssetListEntry['id']; group_id: string | null }, void>(api.assets.setGroup);
}

/** How many of one member a container holds. Zero removes it. Serves decks and bundles alike. */
export function useSetMemberCount() {
  return useLiveMutation<{ container_id: AssetListEntry['id']; member_id: AssetListEntry['id']; count: number }, void>(
    api.assets.setMemberCount
  );
}
