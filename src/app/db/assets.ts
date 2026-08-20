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

export async function loadAssetsByTypes(types: string[]): Promise<AssetsByTypesData> {
  return await db.query(api.assets.listByTypes, { types });
}

export function useAssetsByTypes(types: string[], options?: { initialData?: AssetsByTypesData }) {
  const liveData = useQuery(api.assets.listByTypes, { types });
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}

export function useCreateAsset() {
  return useLiveMutation<{ type: string; data: unknown }, { id: string; slug: string }>(api.assets.create);
}

export type AssetForEditData = FunctionReturnType<typeof api.assets.getForEdit>;

export async function loadAssetForEdit(type: string, slug: string): Promise<AssetForEditData> {
  return await db.query(api.assets.getForEdit, { type, slug });
}

export function useAssetForEdit(type: string, slug: string, options?: { initialData?: AssetForEditData }) {
  const liveData = useQuery(api.assets.getForEdit, { type, slug });
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
