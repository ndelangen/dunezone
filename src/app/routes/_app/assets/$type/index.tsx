import { Button, Select, Stack, Text, Title } from '@mantine/core';
import { parseAssetCatalogueSearch } from '@shared/assets/catalogueSearch';
import type { AssetCatalogueSearch } from '@shared/assets/catalogueSearch';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import type { AssetTypeDefinition } from '@shared/assets/types';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';
import { PageTitle } from '@ui/block/PageTitle';
import { CallToAction } from '@ui/control/CallToAction';
import { CataloguePager } from '@ui/control/CataloguePager';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback } from 'react';

import { loadAssetBrowsePage, useAssetBrowsePage } from '@app/db/assets';
import type { AssetBrowseEntry } from '@app/db/assets';
import { publicPageHead } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

/**
 * The type's name as a noun for one of them.
 * `shortLabel` is not a noun for every type, since it is an adjective for tokens and "Create a round" was a real defect, so the singular comes off `label` instead.
 */
function singularLabel(label: string): string {
  return label.endsWith('s') ? label.slice(0, -1) : label;
}

/** The sort control's options; best match exists only while searching, and is the default then. */
function sortOptions(searching: boolean) {
  return [
    ...(searching ? [{ value: 'relevance', label: 'Best match' }] : []),
    { value: 'newest', label: 'Newest' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'name', label: 'Name' },
  ];
}

/** The page query's arguments for a parsed address; every key is spelled out so the loader deps compare equal however the address was written. */
function browseDeps(search: AssetCatalogueSearch) {
  return { q: search.q, sort: search.sort, page: search.page };
}

/** The search parameters a change writes: any change but a page turn starts again from the first page. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof AssetCatalogueSearch, unknown>>) {
  return parseAssetCatalogueSearch({ ...previous, page: undefined, ...patch });
}

/** The address of one page of the current search and order; the first page has no number. */
function pageSearch(page: number) {
  return (previous: AssetCatalogueSearch): AssetCatalogueSearch => ({ ...previous, page: page > 1 ? page : undefined });
}

export const Route = createFileRoute('/_app/assets/$type/')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseAssetCatalogueSearch,
  loaderDeps: ({ search }) => browseDeps(search),
  loader: async ({ params, deps }) => {
    if (!isAssetType(params.type)) {
      /* Aimed past this route's own not-found page, which only knows how to say a page lies past the end. */
      throw notFound({ routeId: '/_app' });
    }
    const data = await loadAssetBrowsePage({ type: params.type, ...deps });
    /* A page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (data.page > data.pageCount) {
      throw notFound({ data: { pageCount: data.pageCount } });
    }
    return data;
  },
  notFoundComponent: AssetTypePastTheEnd,
  /* Hydration still runs this head for an unknown type, whose match carries the loader's notFound. */
  head: ({ match, params }) => {
    const search = parseAssetCatalogueSearch(match.search);
    const refined = search.q != null || search.sort != null;
    const pathname = `/assets/${encodeURIComponent(params.type)}`;
    const label = isAssetType(params.type) ? ASSET_TYPES[params.type].label : 'Assets';
    const head = publicPageHead({
      /* Only the plain listing's pages are worth a search engine's time; a search or an order is the same assets again. */
      name: search.page && !refined ? `${label}, page ${search.page}` : label,
      pathname: search.page && !refined ? `${pathname}?page=${search.page}` : pathname,
      description: `Browse community ${isAssetType(params.type) ? ASSET_TYPES[params.type].label.toLowerCase() : 'assets'} for the Dune board game. Find pieces for your table, or create and share your own.`,
      match,
    });
    return refined ? { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] } : head;
  },
  component: AssetTypePage,
});

function AssetTypePage() {
  const { type } = Route.useParams();
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const validType = isAssetType(type) ? type : 'card-treachery';
  const definition: AssetTypeDefinition = ASSET_TYPES[validType];
  const live = useAssetBrowsePage({ type: validType, ...deps }, { initialData: loaderData });
  const data = live.data ?? loaderData;

  /* Every write re-parses, so a default never reaches the address. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof AssetCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);

  const noun = singularLabel(definition.label);
  const plural = definition.label.toLowerCase();

  const sortSelect = (label?: string) => (
    <Select
      className={label ? undefined : styles.sortSegment}
      variant={label ? 'default' : 'unstyled'}
      label={label}
      aria-label="Sort"
      allowDeselect={false}
      data={sortOptions(Boolean(search.q))}
      value={search.sort ?? (search.q ? 'relevance' : 'newest')}
      onChange={(value) =>
        changeSearch({ sort: value === 'relevance' || (value === 'newest' && !search.q) ? undefined : value })
      }
    />
  );

  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="xs" align="center">
          <PageTitle eyebrow="Community assets" title={definition.label} />
          <Text c="dimmed" ta="center" maw="34rem">
            Every {noun.toLowerCase()} the community has made. Open one to see it up close, or make your own.
          </Text>
          {definition.status === 'live' ? (
            <CallToAction
              attention
              renderRoot={(rootProps) => <Link {...rootProps} to="/assets/$type/create" params={{ type: validType }} />}
            >
              Create a {noun.toLowerCase()}
            </CallToAction>
          ) : null}
        </Stack>
      </PageLayout.Header>
      {definition.status === 'live' ? (
        <PageLayout.Toolbar>
          <Toolbar>
            <Toolbar.Left label="Navigation">
              {/* A way back to the shelves, where a result count stood: the number told nobody anything a full grid did not (Norbert, 2026-08-21). */}
              <IconAction
                label="Back to all assets"
                emphasis="standard"
                intent="neutral"
                size="lg"
                icon={<ArrowLeft size={17} aria-hidden />}
                renderRoot={(rootProps) => <Link {...rootProps} to="/assets" />}
              />
            </Toolbar.Left>
            <Toolbar.Center>
              <SearchRefine
                label={`${definition.label} filters`}
                search={{
                  value: query.value,
                  onChange: query.change,
                  onCommit: query.commit,
                  label: `Search ${definition.label.toLowerCase()}`,
                  placeholder: 'Search by name or owner…',
                }}
                refine={{
                  label: `Refine ${definition.label.toLowerCase()}`,
                  content: sortSelect('Sort by'),
                }}
              >
                {sortSelect()}
              </SearchRefine>
            </Toolbar.Center>
            <Toolbar.Right label={`${definition.label} actions`}>
              <IconAction
                label={`Create a ${noun.toLowerCase()}`}
                emphasis="strong"
                intent="positive"
                size="lg"
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/assets/$type/create" params={{ type: validType }} />
                )}
                icon={<Plus size={17} aria-hidden />}
              />
            </Toolbar.Right>
          </Toolbar>
        </PageLayout.Toolbar>
      ) : null}
      <PageLayout.Content>
        <Surface padding="xl">
          {definition.status === 'planned' ? (
            <Stack gap="xs" align="center">
              <Title order={2}>Planned</Title>
              <Text c="dimmed" ta="center">
                {definition.label} are on the roadmap. This type cannot hold assets yet.
              </Text>
            </Stack>
          ) : data.total === 0 ? (
            <Stack gap="xs" align="center">
              <Title order={2}>{data.typeTotal === 0 ? 'Nothing here yet' : 'Nothing matches'}</Title>
              <Text c="dimmed" ta="center">
                {data.typeTotal === 0
                  ? `No ${plural} have been created so far.`
                  : `No ${singularLabel(plural)} matches this search.`}
              </Text>
            </Stack>
          ) : data.entries.length === 0 ? (
            <PastTheEnd type={validType} pageCount={data.pageCount} />
          ) : (
            <Stack gap="lg" aria-busy={live.isPending}>
              <TileGrid>
                {data.entries.map((entry) => (
                  <BrowseTile key={entry.id} entry={entry} />
                ))}
              </TileGrid>
              <CataloguePager
                page={data.page}
                pageCount={data.pageCount}
                pageSize={data.pageSize}
                total={data.total}
                complete={data.complete}
                noun={plural}
                label={`${definition.label} pages`}
                pageLinkProps={(page) => ({
                  component: Link,
                  to: '/assets/$type',
                  params: { type: validType },
                  search: pageSearch(page),
                })}
              />
            </Stack>
          )}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** A page past the end, from an old link or a list that shrank: say where the results end and link there. */
function PastTheEnd({ type, pageCount }: { type: string; pageCount: number }) {
  return (
    <Stack gap="sm" align="center">
      <Title order={2}>Nothing on this page</Title>
      <Text c="dimmed">
        {pageCount === 1 ? 'These results fit on one page.' : `These results end on page ${pageCount}.`}
      </Text>
      <Button
        variant="default"
        renderRoot={(props) => <Link {...props} to="/assets/$type" params={{ type }} search={pageSearch(pageCount)} />}
      >
        {pageCount === 1 ? 'Go to the results' : `Go to page ${pageCount}`}
      </Button>
    </Stack>
  );
}

function AssetTypePastTheEnd({ data }: NotFoundRouteProps) {
  const { type } = Route.useParams();
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  return (
    <PageMessage title={isAssetType(type) ? ASSET_TYPES[type].label : 'Assets'}>
      <PastTheEnd type={type} pageCount={pageCount} />
    </PageMessage>
  );
}

/**
 * One slot on the grid: a link to the asset, and nothing else.
 *
 * There is deliberately no Edit here.
 * «Type browse page design» had put one on the tile as well as the page, and Norbert reversed it on 2026-08-20: an overview never jumps straight into editing, and edit is reached from the toolbar on a detail page.
 * Losing it makes the whole tile one anchor again, since the sibling structure only existed because an anchor may not contain a control.
 */
function BrowseTile({ entry }: { entry: AssetBrowseEntry }) {
  return (
    <OpenableTile
      caption={entry.name}
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/assets/$type/$slug" params={{ type: entry.type, slug: entry.slug }} />
      )}
    >
      <AssetFace
        href={entry.previewHref}
        type={entry.type}
        data={entry.data}
        name={entry.name}
        members={entry.members}
      />
    </OpenableTile>
  );
}
