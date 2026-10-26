import { assetSubjectFacts } from '@shared/access/collaborativeAccess';
import type { AssetViewerAccess } from '@shared/access/collaborativeAccess';
import { usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

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

/**
 * The rows a list of catalogue references names, in order, with null for a reference the catalogue no longer has.
 * A picker that lists what was chosen reads it, so it subscribes only while that list is on screen.
 */
export function useAssetsByReference(refs: { type: string; slug: string }[]) {
  return toLiveQueryResult(useQuery(api.assets.listByReference, { refs }));
}

export type AssetBrowsePageData = FunctionReturnType<typeof api.assets.catalogue>;
export type AssetBrowseEntry = AssetBrowsePageData['entries'][number];

/** What one `/assets/{type}` page asks for: the type and the route's search parameters, as `assets.catalogue` takes them. */
export type AssetBrowseArgs = FunctionArgs<typeof api.assets.catalogue>;

/** One asset type's browse route loader, paired with `useAssetBrowsePage`; a searched page is not held, for the same reason. */
export async function loadAssetBrowsePage(args: AssetBrowseArgs): Promise<AssetBrowsePageData> {
  return await db.query(api.assets.catalogue, args, { hold: !args.q });
}

/**
 * One live browse page, taking `loadAssetBrowsePage`'s result for the same arguments as `initialData`.
 * A searched page is not held warm after it is left: every committed search is its own subscription, and holding each would keep re-running them on every asset write.
 */
export function useAssetBrowsePage(args: AssetBrowseArgs, options?: { initialData?: AssetBrowsePageData }) {
  const liveData = useLiveQuery(api.assets.catalogue, args, { hold: !args.q });
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
  return { ...useAssetViewerPage(page), isPending: liveData === undefined };
}

function useAssetViewerPage(page: AssetPublicPage) {
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

/** Changes a treachery card into editable custom-card layers without creating another asset. */
export function useConvertTreacheryToCustom() {
  return useLiveMutation<{ id: AssetListEntry['id'] }, { id: string; slug: string }>(
    api.assets.convertTreacheryToCustom
  );
}

/** Converts one existing Custom Card using a complete Spice draft, after the page's explicit confirmation. */
export function useConvertCustomToSpice() {
  return useLiveMutation<{ id: AssetListEntry['id']; data: unknown }, { id: string; slug: string }>(
    api.assets.convertCustomToSpice
  );
}

/** A Spice card editor holds this read while its draft links a board: the board, its name and the placed tokens' fronts. */
export function useSpiceCardBoard(boardId: string, tokenIds: string[]) {
  return useQuery(api.assets.spiceCardBoard, {
    boardId: boardId as AssetListEntry['id'],
    tokenIds: tokenIds as AssetListEntry['id'][],
  });
}

type AssetDetailChunk = FunctionReturnType<typeof api.assets.detailPage>['page'][number];
export type AssetDetailInitialPage = NonNullable<AssetPublicPage> & { relatedFaq: AssetDetailChunk['items'] };

/** The public detail and its first range of related questions travel together. */
export async function loadAssetDetailPage(type: string, slug: string): Promise<AssetDetailInitialPage | null> {
  const result = await db.query(
    api.assets.detailPage,
    { type, slug, paginationOpts: { numItems: 12, cursor: null } },
    { hold: false }
  );
  const first = result.page[0];
  return first.detail ? { ...first.detail, relatedFaq: first.items } : null;
}

export function useAssetDetailPage(type: string, slug: string, options: { initialData: AssetDetailInitialPage }) {
  const query = usePaginatedQuery(api.assets.detailPage, { type, slug }, { initialNumItems: 12 });
  const first = query.results[0];
  const page = first === undefined ? options.initialData : first.detail;
  return {
    ...useAssetViewerPage(page),
    isPending: first === undefined,
    relatedFaq: first ? query.results.flatMap((chunk) => chunk.items) : options.initialData.relatedFaq,
    faqStatus: query.status,
    loadMoreFaq: () => query.loadMore(12),
  };
}
