import { Select, Stack, Text, Title } from '@mantine/core';
import { ASSET_CATALOGUE_PAGE_SIZE, parseAssetCatalogueSearch } from '@shared/assets/catalogueSearch';
import type { AssetCatalogueSearch } from '@shared/assets/catalogueSearch';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import type { AssetTypeDefinition } from '@shared/assets/types';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { PastTheEnd } from '@ui/block/EmptyResults';
import { PageTitle } from '@ui/block/PageTitle';
import { CallToAction } from '@ui/control/CallToAction';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback, useRef } from 'react';
import type { Ref } from 'react';

import { loadAssetBrowsePage, useAssetBrowsePage } from '@app/db/assets';
import type { AssetBrowseArgs, AssetBrowsePageData } from '@app/db/assets';
import { useFocusFirstNewRow, useGrowingLimit, useGrowingSearch } from '@app/routes/growingSearch';
import { publicPageHead } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { AssetCatalogueTile } from '@app/widgets/asset-face/AssetCatalogueTile';
import { CatalogueResults } from '@app/widgets/catalogue-results/CatalogueResults';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

/**
 * The type's name as a noun for one of them.
 * `shortLabel` is not a noun for every type, since it is an adjective for tokens and "Create a round" was a real defect, so the singular comes off `label` instead.
 */
function singularLabel(label: string): string {
  return label.endsWith('s') ? label.slice(0, -1) : label;
}

/** The sort control's options: a search is always best match, so it has that one option; the orders are for browsing. */
function sortOptions(searching: boolean) {
  return searching
    ? [{ value: 'relevance', label: 'Best match' }]
    : [
        { value: 'newest', label: 'Newest' },
        { value: 'updated', label: 'Recently updated' },
        { value: 'name', label: 'Name' },
      ];
}

/**
 * The page query's arguments for an address, parsed again since the router keeps a parameter the parser dropped, such as an old link's page beside a search;
 * every key is spelled out so the loader deps compare equal however the address was written.
 */
function browseDeps(search: AssetCatalogueSearch) {
  const parsed = parseAssetCatalogueSearch(search);
  return { q: parsed.q, sort: parsed.sort, page: parsed.page };
}

/** How many tiles a search shows at first, and how many more each "Load more" asks for. */
const SEARCH_STEP = ASSET_CATALOGUE_PAGE_SIZE;

/** The tiles' links, as the grid renders them, in their order. */
const TILE_LINK = 'a[href^="/assets/"]';

/** The query's arguments at one limit: a search asks for its best matches up to it, a browsed page ignores it. */
function catalogueQueryArgs(args: AssetBrowseArgs, limit: number): AssetBrowseArgs {
  return { ...args, limit: args.q ? limit : undefined };
}

/** The live type for a parsed address at one limit; the growing list asks for a longer one through it. */
function useTypeRows(args: AssetBrowseArgs, limit: number) {
  return useAssetBrowsePage(catalogueQueryArgs(args, limit)).data;
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
    const data = await loadAssetBrowsePage(catalogueQueryArgs({ type: params.type, ...deps }, SEARCH_STEP));
    /* A browsed page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (!('mode' in data) && data.page > data.pageCount) {
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
  const growing = useGrowingLimit({ type: validType, ...deps }, SEARCH_STEP);
  const live = useTypeRows({ type: validType, ...deps }, growing.limit);
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    search: growing,
    initial: loaderData,
    live,
    rows: (page) => page.entries.length,
  });
  const grid = useRef<HTMLDivElement>(null);
  useFocusFirstNewRow(grid, loaded, grown, TILE_LINK);

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

  /* A search is always best match, so its sort takes no change; choosing an order is for browsing. */
  const sortSelect = (label?: string) => (
    <Select
      className={label ? undefined : styles.sortSegment}
      variant={label ? 'default' : 'unstyled'}
      label={label}
      aria-label="Sort"
      allowDeselect={false}
      data={sortOptions(Boolean(search.q))}
      value={search.q ? 'relevance' : (search.sort ?? 'newest')}
      disabled={Boolean(search.q)}
      onChange={(value) => changeSearch({ sort: value === 'newest' ? undefined : value })}
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
        <TypeContent
          definition={definition}
          type={validType}
          plural={plural}
          data={data}
          loading={loading}
          loaded={loaded}
          onLoadMore={loadMore}
          ref={grid}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

type TypeContentProps = {
  definition: AssetTypeDefinition;
  type: string;
  plural: string;
  data: AssetBrowsePageData;
  loading: boolean;
  /** Whether the longer grid asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  ref: Ref<HTMLDivElement>;
};

/** The page's body: a type still planned, an empty type, a search, or a browsed page. */
function TypeContent({ definition, type, plural, data, loading, loaded, onLoadMore, ref }: TypeContentProps) {
  if (definition.status === 'planned') {
    return (
      <Surface padding="xl">
        <Stack gap="xs" align="center">
          <Title order={2}>Planned</Title>
          <Text c="dimmed" ta="center">
            {definition.label} are on the roadmap. This type cannot hold assets yet.
          </Text>
        </Stack>
      </Surface>
    );
  }
  if (data.typeTotal === 0) {
    return (
      <Surface padding="xl">
        <Stack gap="xs" align="center">
          <Title order={2}>Nothing here yet</Title>
          <Text c="dimmed" ta="center">
            No {plural} have been created so far.
          </Text>
        </Stack>
      </Surface>
    );
  }
  return (
    <CatalogueResults
      results={'mode' in data ? { kind: 'search', ...data } : { kind: 'browse', ...data }}
      noun={plural}
      singular={singularLabel(plural)}
      pagerLabel={`${definition.label} pages`}
      pageLinkProps={(page) => assetTypePageLink(type, page)}
      renderTiles={(entries) => (
        <Surface padding="xl">
          <TileGrid>
            {entries.map((entry) => (
              <AssetCatalogueTile key={entry.id} entry={entry} />
            ))}
          </TileGrid>
        </Surface>
      )}
      loading={loading}
      loaded={loaded}
      onLoadMore={onLoadMore}
      ref={ref}
    />
  );
}

/** The link to one page of a type's browsed list. */
function assetTypePageLink(type: string, page: number) {
  return { component: Link, to: '/assets/$type', params: { type }, search: pageSearch(page) };
}

function AssetTypePastTheEnd({ data }: NotFoundRouteProps) {
  const { type } = Route.useParams();
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  const label = isAssetType(type) ? ASSET_TYPES[type].label : 'Assets';
  return (
    <PageMessage title={label}>
      <PastTheEnd
        pageCount={pageCount}
        noun={label.toLowerCase()}
        pageLinkProps={(page) => assetTypePageLink(type, page)}
      />
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
