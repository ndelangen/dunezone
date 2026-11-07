import { Select, Stack } from '@mantine/core';
import { RULESET_CATALOGUE_PAGE_SIZE, parseRulesetCatalogueSearch } from '@shared/rulesets/catalogueSearch';
import type { RulesetCatalogueSearch } from '@shared/rulesets/catalogueSearch';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { EmptyResults, PastTheEnd } from '@ui/block/EmptyResults';
import { OpenableTile } from '@ui/block/OpenableTile';
import { PageTitle } from '@ui/block/PageTitle';
import { CallToAction } from '@ui/control/CallToAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ControlBlockField } from '@ui/control/ControlBlock';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { useCallback, useRef } from 'react';
import type { Ref } from 'react';

import { loadRulesetCataloguePage, useRulesetCataloguePage } from '@db/rulesets';
import type { RulesetCatalogueArgs, RulesetCatalogueEntry, RulesetCataloguePageData } from '@db/rulesets';
import { useFocusFirstNewRow, useGrowingLimit, useGrowingSearch } from '@app/routes/growingSearch';
import { publicPageHead } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { CatalogueResults } from '@app/widgets/catalogue-results/CatalogueResults';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

/** The sort control's options: a search is always best match, so it has that one option; the orders are for browsing. */
function sortOptions(searching: boolean) {
  return searching
    ? [{ value: 'relevance', label: 'Best match' }]
    : [
        { value: 'name', label: 'Alphabetical (A–Z)' },
        { value: 'newest', label: 'Newest' },
      ];
}

/**
 * The page query's arguments for an address, parsed again since the router keeps a parameter the parser dropped, such as an old link's page beside a search;
 * every key is spelled out so the loader deps compare equal however the address was written.
 */
function catalogueDeps(search: RulesetCatalogueSearch) {
  const parsed = parseRulesetCatalogueSearch(search);
  return { q: parsed.q, sort: parsed.sort, page: parsed.page };
}

/** How many tiles a search shows at first, and how many more each "Load more" asks for. */
const SEARCH_STEP = RULESET_CATALOGUE_PAGE_SIZE;

/** The tiles' links, as the grid renders them, in their order. */
const TILE_LINK = 'a[href^="/rulesets/"]';

/** The query's arguments at one limit: a search asks for its best matches up to it, a browsed page ignores it. */
function catalogueQueryArgs(args: RulesetCatalogueArgs, limit: number): RulesetCatalogueArgs {
  return { ...args, limit: args.q ? limit : undefined };
}

/** The live catalogue for a parsed address at one limit; the growing grid asks for a longer one through it. */
function useCatalogueRows(args: RulesetCatalogueArgs, limit: number) {
  return useRulesetCataloguePage(catalogueQueryArgs(args, limit)).data;
}

/** The search parameters a change writes: any change but a page turn starts again from the first page. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof RulesetCatalogueSearch, unknown>>) {
  return parseRulesetCatalogueSearch({ ...previous, page: undefined, ...patch });
}

/** The address of one page of the current order; the first page has no number. */
function pageSearch(page: number) {
  return (previous: RulesetCatalogueSearch): RulesetCatalogueSearch => ({
    ...previous,
    page: page > 1 ? page : undefined,
  });
}

export const Route = createFileRoute('/_app/rulesets/')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseRulesetCatalogueSearch,
  loaderDeps: ({ search }) => catalogueDeps(search),
  loader: async ({ deps }) => {
    const data = await loadRulesetCataloguePage(catalogueQueryArgs(deps, SEARCH_STEP));
    /* A browsed page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (!('mode' in data) && data.page > data.pageCount) {
      throw notFound({ data: { pageCount: data.pageCount } });
    }
    return data;
  },
  notFoundComponent: RulesetsPastTheEnd,
  head: ({ match }) => {
    const search = parseRulesetCatalogueSearch(match.search);
    const refined = search.q != null || search.sort != null;
    const head = publicPageHead({
      /* Only the plain catalogue's pages are worth a search engine's time; a search or an order is the same rulesets again. */
      name:
        search.page && !refined
          ? `Dune board game rulesets and rulebooks, page ${search.page}`
          : 'Dune board game rulesets and rulebooks',
      pathname: search.page && !refined ? `/rulesets?page=${search.page}` : '/rulesets',
      description:
        'Read community rulesets and published Rulebooks for the Dune board game, including Dreamrules. Build a ruleset for your own table.',
      social: { kind: 'Rulesets', shape: 'portrait' },
      match,
    });
    return refined ? { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] } : head;
  },
  component: RulesetsPage,
});

function RulesetsPage() {
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const growing = useGrowingLimit(deps, SEARCH_STEP);
  const live = useCatalogueRows(deps, growing.limit);
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    search: growing,
    initial: loaderData,
    live,
    rows: (page) => page.entries.length,
  });
  const grid = useRef<HTMLDivElement>(null);
  useFocusFirstNewRow(grid, loaded, grown, TILE_LINK);

  /* Every write re-parses, so a default never reaches the address. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof RulesetCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);

  /* A search is always best match, so its sort takes no change; choosing an order is for browsing. */
  const sortSelect = (label?: string) => {
    const field = (fieldProps?: ControlBlockField) => (
      <Select
        {...fieldProps}
        className={label ? undefined : styles.sortSegment}
        variant={label ? 'default' : 'unstyled'}
        aria-label="Sort"
        allowDeselect={false}
        data={sortOptions(Boolean(search.q))}
        value={search.q ? 'relevance' : (search.sort ?? 'name')}
        disabled={Boolean(search.q)}
        onChange={(value) => changeSearch({ sort: value === 'name' ? undefined : value })}
      />
    );
    return label ? <ControlBlock title={label} input={field} /> : field();
  };

  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="xs" align="center">
          <PageTitle title="Rulesets" />
          <CallToAction attention renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets/create" />}>
            Create a ruleset
          </CallToAction>
        </Stack>
      </PageLayout.Header>
      {data.rulesetTotal > 0 ? (
        <PageLayout.Toolbar>
          <Toolbar>
            <Toolbar.Center>
              <SearchRefine
                label="Ruleset filters"
                search={{
                  value: query.value,
                  onChange: query.change,
                  onCommit: query.commit,
                  label: 'Search rulesets',
                  placeholder: 'Search rulesets…',
                }}
                refine={{ label: 'Refine rulesets', content: sortSelect('Sort by') }}
              >
                {sortSelect()}
              </SearchRefine>
            </Toolbar.Center>
          </Toolbar>
        </PageLayout.Toolbar>
      ) : null}
      <PageLayout.Content>
        <CatalogueContent data={data} loading={loading} loaded={loaded} onLoadMore={loadMore} ref={grid} />
      </PageLayout.Content>
    </PageLayout>
  );
}

type CatalogueContentProps = {
  data: RulesetCataloguePageData;
  loading: boolean;
  /** Whether the longer grid asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  ref: Ref<HTMLDivElement>;
};

/** The page's body: an empty catalogue, a search, or a browsed page. */
function CatalogueContent({ data, loading, loaded, onLoadMore, ref }: CatalogueContentProps) {
  if (data.rulesetTotal === 0) {
    return (
      <Surface padding="xl">
        <EmptyResults title="Nothing here yet">No rulesets have been created so far.</EmptyResults>
      </Surface>
    );
  }
  return (
    <CatalogueResults
      results={
        'mode' in data
          ? { kind: 'search', ...data, loading, loaded, onLoadMore }
          : { kind: 'browse', ...data, pagerLabel: 'Ruleset pages', pageLinkProps: rulesetPageLink }
      }
      noun="rulesets"
      noMatches="No ruleset matches this search."
      renderEntries={(entries) => <RulesetTiles entries={entries} />}
      ref={ref}
    />
  );
}

/** The link to one page of the browsed catalogue. */
function rulesetPageLink(page: number) {
  return { component: Link, to: '/rulesets', search: pageSearch(page) };
}

function RulesetTiles({ entries }: { entries: readonly RulesetCatalogueEntry[] }) {
  return (
    <TileGrid>
      {entries.map((entry) => (
        <RulesetTile key={entry.id} entry={entry} />
      ))}
    </TileGrid>
  );
}

/** One slot on the grid: a link to the ruleset under its cover, and nothing else. */
function RulesetTile({ entry }: { entry: RulesetCatalogueEntry }) {
  return (
    <OpenableTile
      caption={entry.name}
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: entry.slug }} />
      )}
    >
      <div className={styles.cover}>
        {entry.coverThumbUrl ? (
          <img src={entry.coverThumbUrl} alt="" className={styles.coverImage} />
        ) : (
          <span className={styles.coverPlaceholder}>No cover</span>
        )}
      </div>
    </OpenableTile>
  );
}

function RulesetsPastTheEnd({ data }: NotFoundRouteProps) {
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  return (
    <PageMessage title="Rulesets">
      <PastTheEnd pageCount={pageCount} noun="rulesets" pageLinkProps={rulesetPageLink} />
    </PageMessage>
  );
}
