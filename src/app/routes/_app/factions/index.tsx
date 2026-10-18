import {
  Badge,
  Button,
  Group,
  InputBase,
  Popover,
  RangeSlider,
  Select,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import {
  complexityRangeSearchValue,
  FACTION_CATALOGUE_PAGE_SIZE,
  parseComplexityRange,
  parseFactionCatalogueSearch,
} from '@shared/factions/catalogueSearch';
import type { FactionCatalogueSearch, FactionComplexityRange } from '@shared/factions/catalogueSearch';
import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import type { ErrorComponentProps, NotFoundRouteProps } from '@tanstack/react-router';
import { FactionCatalogueSpotlight } from '@ui/block/FactionCatalogueSpotlight';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { complexityTierSliderMarks } from '@ui/content/ComplexityGlyph';
import { formatStableDate } from '@ui/content/dates';
import { errorMessage } from '@ui/content/errorMessage';
import { CallToAction } from '@ui/control/CallToAction';
import { CataloguePager, catalogueCountLabel } from '@ui/control/CataloguePager';
import { IconAction } from '@ui/control/IconAction';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { FactionList } from '@ui/list/FactionList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowDownAZ, ChevronsDown, Filter, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';

import { loadFactionCataloguePage, useFactionCataloguePage } from '@db/factions';
import type {
  FactionCatalogueArgs,
  FactionCatalogueBrowseData,
  FactionCataloguePageData,
  FactionCatalogueRuleset,
  FactionCatalogueSearchData,
} from '@db/factions';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { useFocusFirstNewRow, useGrowingSearch } from '@app/routes/growingSearch';
import { publicPageHead } from '@app/routes/publicPage';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { factionCatalogueArgs, useFactionCatalogueSession } from './catalogue';
import styles from './index.module.css';

/** How many cards a search shows at first, and how many more each "Load more" asks for. */
const SEARCH_STEP = FACTION_CATALOGUE_PAGE_SIZE;

/** The cards' links, as the list renders them, in their order. */
const CARD_LINK = 'a[href^="/factions/"]';

/** The query's arguments at one limit: a search asks for its best matches up to it, a browsed page ignores it. */
function catalogueQueryArgs(deps: FactionCatalogueArgs, limit: number): FactionCatalogueArgs {
  return { ...deps, limit: deps.q ? limit : undefined };
}

/** The live catalogue for a parsed address at one limit; the growing list asks for a longer one through it. */
function useCatalogueRows(deps: FactionCatalogueArgs, limit: number) {
  return useFactionCataloguePage(catalogueQueryArgs(deps, limit)).data;
}

export const Route = createFileRoute('/_app/factions/')({
  ssr: true,
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent', 'notFoundComponent']],
  validateSearch: parseFactionCatalogueSearch,
  loaderDeps: ({ search }) => factionCatalogueArgs(search),
  loader: async ({ deps }) => {
    const data = await loadFactionCataloguePage(catalogueQueryArgs(deps, SEARCH_STEP));
    /* A browsed page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (!('mode' in data) && data.page > data.pageCount) {
      throw notFound({ data: { pageCount: data.pageCount } });
    }
    return data;
  },
  pendingComponent: FactionCataloguePending,
  errorComponent: FactionCatalogueError,
  notFoundComponent: FactionCataloguePastTheEnd,
  head: ({ match }) => {
    const search = parseFactionCatalogueSearch(match.search);
    /* Only the plain listing's pages are worth a search engine's time; a search, filter or order is the same factions again. */
    const refined = search.q != null || search.ruleset != null || search.complexity != null || search.sort != null;
    const head = publicPageHead({
      name:
        search.page && !refined
          ? `Custom Dune board game factions, page ${search.page}`
          : 'Custom Dune board game factions',
      pathname: search.page && !refined ? `/factions?page=${search.page}` : '/factions',
      description:
        "Browse homebrew factions for Gale Force Nine's Dune board game: custom advantages, leaders and printable faction sheets. Create and share your own faction.",
      match,
    });
    return refined ? { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] } : head;
  },
  component: FactionsPage,
});

function FactionsPage() {
  const loaderData = Route.useLoaderData();
  const args = Route.useLoaderDeps();
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    args,
    step: SEARCH_STEP,
    initial: loaderData,
    useLive: useCatalogueRows,
    rows: (page) => page.cards.length,
  });
  const session = useFactionCatalogueSession(data.rulesets);
  const list = useRef<HTMLDivElement>(null);
  useFocusFirstNewRow(list, loaded, grown, CARD_LINK);
  const hasFactions = data.catalogueTotal > 0;

  return (
    <PageLayout>
      <PageLayout.Header>
        <CatalogueHeader spotlights={hasFactions ? data.spotlights : undefined} />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        {hasFactions ? (
          <CatalogueToolbar
            draftQuery={session.query.value}
            onDraftQueryChange={session.query.change}
            onCommitQuery={session.query.commit}
            search={session.search}
            rulesets={data.rulesets}
            matched={'mode' in data ? undefined : { count: data.total, complete: data.complete }}
            totalCount={data.catalogueTotal}
            onSearchChange={session.changeSearch}
          />
        ) : undefined}
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <CatalogueContent
          data={data}
          loading={loading}
          loaded={loaded}
          onLoadMore={loadMore}
          selectedRulesetSlug={session.search.ruleset}
          onReset={session.reset}
          ref={list}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

type CatalogueContentProps = {
  data: FactionCataloguePageData;
  loading: boolean;
  /** Whether the longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  selectedRulesetSlug: string | undefined;
  onReset: () => void;
  ref: Ref<HTMLDivElement>;
};

/** The page's body: an empty collection, a search, or a browsed page. */
function CatalogueContent({
  data,
  loading,
  loaded,
  onLoadMore,
  selectedRulesetSlug,
  onReset,
  ref,
}: CatalogueContentProps) {
  if (data.catalogueTotal === 0) {
    return (
      <Surface padding="xl">
        <Title order={2}>There are no factions</Title>
        <Text c="dimmed" mt="xs">
          Create the first faction to begin the collection.
        </Text>
      </Surface>
    );
  }
  if ('mode' in data) {
    return (
      <SearchedCatalogue
        data={data}
        loading={loading}
        loaded={loaded}
        onLoadMore={onLoadMore}
        selectedRulesetSlug={selectedRulesetSlug}
        onReset={onReset}
        ref={ref}
      />
    );
  }
  return <BrowsedCatalogue data={data} loading={loading} selectedRulesetSlug={selectedRulesetSlug} onReset={onReset} />;
}

/** One page of the browsed catalogue, with its pager. */
function BrowsedCatalogue({
  data,
  loading,
  selectedRulesetSlug,
  onReset,
}: {
  data: FactionCatalogueBrowseData;
  loading: boolean;
  selectedRulesetSlug: string | undefined;
  onReset: () => void;
}) {
  if (data.total === 0) {
    return <FilteredEmptyState complete={data.complete} onReset={onReset} />;
  }
  if (data.cards.length === 0) {
    return <PastTheEnd pageCount={data.pageCount} />;
  }
  return (
    <Stack gap="lg" aria-busy={loading}>
      <FactionList factions={data.cards} selectedRulesetSlug={selectedRulesetSlug} />
      <CataloguePager
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        total={data.total}
        complete={data.complete}
        noun="factions"
        label="Faction catalogue pages"
        pageLinkProps={(page) => ({ component: Link, to: '/factions', search: pageSearch(page) })}
      />
    </Stack>
  );
}

/**
 * The best matches of a search, and a "Load more" that asks for a longer list while there is one: no count and no pages.
 * When the longer list arrives, focus moves to its first new card, so a keyboard reader carries on from where the list grew.
 */
function SearchedCatalogue({
  data,
  loading,
  loaded,
  onLoadMore,
  selectedRulesetSlug,
  onReset,
  ref,
}: {
  data: FactionCatalogueSearchData;
  loading: boolean;
  /** Whether the longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  selectedRulesetSlug: string | undefined;
  onReset: () => void;
  ref: Ref<HTMLDivElement>;
}) {
  if (data.cards.length === 0) {
    return <FilteredEmptyState complete={!data.capped} onReset={onReset} />;
  }
  return (
    <Stack gap="lg" aria-busy={loading} ref={ref}>
      <FactionList factions={data.cards} selectedRulesetSlug={selectedRulesetSlug} />
      {/* The cards say how many arrived; this says only that they did, so a reader hears the list grow without a count the page never shows. */}
      <VisuallyHidden role="status" aria-live="polite">
        {loaded ? 'More factions loaded' : null}
      </VisuallyHidden>
      {data.hasMore ? <LoadMoreButton loading={loading} onLoadMore={onLoadMore} /> : null}
      {data.capped ? (
        <Text c="dimmed" ta="center">
          That's as far as this search goes. Add a word to narrow it.
        </Text>
      ) : null}
    </Stack>
  );
}

/*
 * No way back on either frame: the catalogue is the top of its own branch, so a link here would
 * point at the page the reader is already on.
 *
 * These two states lose the catalogue header's eyebrow, its description and its create-a-faction
 * call to action, which the frame does not carry. That is the one place in this slice where the
 * shared frame costs a reader something they could have used, and it is a deliberate trade for one
 * spelling of "still loading" and one of "did not load" across the tree.
 */
function FactionCataloguePending() {
  return (
    <PageMessage title="Faction catalogue">
      <LoadPending title="Loading factions">The faction catalogue is still loading.</LoadPending>
    </PageMessage>
  );
}

function FactionCatalogueError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Faction catalogue">
      <LoadError title="Faction catalogue could not be loaded" stale={isStaleClientData(error)}>
        {errorMessage(error)}
      </LoadError>
    </PageMessage>
  );
}

function CatalogueHeader({ spotlights }: { spotlights?: FactionCataloguePageData['spotlights'] }) {
  const hasSpotlight = Boolean(spotlights?.newArrival || spotlights?.freshlyUpdated);

  return (
    <Stack className={styles.catalogueHeader} gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} align="flex-start" miw={0}>
          <PageTitle eyebrow="Explore the collection" title="Faction catalogue" />
          <Text size="sm" c="dimmed">
            Browse the living collection of community factions.
          </Text>
        </Stack>
        <CallToAction attention renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}>
          Create your own faction
        </CallToAction>
      </Group>

      {hasSpotlight ? (
        <div className={styles.spotlightRail}>
          {spotlights?.newArrival ? (
            <FactionCatalogueSpotlight
              faction={spotlights.newArrival}
              label="New arrival"
              meta={`Created ${formatStableDate(spotlights.newArrival.created_at)}`}
            />
          ) : null}
          {spotlights?.freshlyUpdated ? (
            <FactionCatalogueSpotlight
              faction={spotlights.freshlyUpdated}
              label="Freshly updated"
              meta={`Updated ${formatStableDate(spotlights.freshlyUpdated.updated_at)}`}
            />
          ) : null}
        </div>
      ) : null}
    </Stack>
  );
}

const COMPLEXITY_SLIDER_MARKS = complexityTierSliderMarks();

/** One controlled range control shared by the desktop popover and mobile drawer. */
function ComplexityRangeSlider({
  value,
  onCommit,
}: {
  value: string | undefined;
  onCommit: (value: FactionComplexityRange) => void;
}) {
  const [draft, setDraft] = useState<FactionComplexityRange>(() => parseComplexityRange(value));
  const [seeded, setSeeded] = useState(value);
  /* Reset during render, the search box's pattern. Compared on the raw prop rather than on the parsed
     range, because parsing allocates a new object every call and would reset on every render. */
  if (value !== seeded) {
    setSeeded(value);
    setDraft(parseComplexityRange(value));
  }

  return (
    <RangeSlider
      min={0}
      max={10}
      step={1}
      minRange={0}
      value={draft}
      onChange={setDraft}
      onChangeEnd={(next) => {
        setDraft(next);
        onCommit(next);
      }}
      label={(point) => `${point}/10`}
      marks={COMPLEXITY_SLIDER_MARKS}
      mb="md"
      thumbFromLabel="Minimum complexity"
      thumbToLabel="Maximum complexity"
    />
  );
}

/**
 * The band's filter field: one popover holding the ruleset chips and the complexity range, everything that narrows the grid, while sorting stays its own field.
 * The trigger reads exactly like the selects beside it.
 */
function CatalogueRefine({
  search,
  rulesetOptions,
  rulesets,
  matched,
  totalCount,
  onSearchChange,
}: {
  search: FactionCatalogueSearch;
  rulesetOptions: { value: string; label: string }[];
  rulesets: FactionCatalogueRuleset[];
  matched: MatchedCount | undefined;
  totalCount: number;
  onSearchChange: (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => void;
}) {
  const rulesetActive = search.ruleset != null;
  const rangeActive = search.complexity != null;
  const activeCount = (rulesetActive ? 1 : 0) + (rangeActive ? 1 : 0);

  const rulesetCount = (slug: string) =>
    slug === 'all' ? totalCount : (rulesets.find((ruleset) => ruleset.slug === slug)?.factionCount ?? 0);

  return (
    <Popover position="bottom" width={320} closeOnEscape trapFocus>
      <Popover.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          variant="unstyled"
          leftSection={<Filter size={15} aria-hidden />}
          rightSection={<ChevronsDown size={15} aria-hidden opacity={0.6} />}
          aria-label="Refine factions by ruleset and complexity"
        >
          Refine{activeCount > 0 ? ` (${activeCount})` : ''}
        </InputBase>
      </Popover.Target>
      <Popover.Dropdown style={{ padding: 0, border: 0, boxShadow: 'none' }}>
        <Surface padding="md">
          <Stack gap="md">
            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Ruleset
              </Text>
              <Group gap={6} role="group" aria-label="Filter factions by ruleset">
                {rulesetOptions.map((option) => {
                  const selected = (search.ruleset ?? 'all') === option.value;
                  return (
                    <Badge
                      key={option.value}
                      component="button"
                      type="button"
                      aria-pressed={selected}
                      variant={selected ? 'filled' : 'light'}
                      color={selected ? 'selected' : 'gray'}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        onSearchChange({
                          ruleset: option.value === 'all' ? undefined : option.value,
                        })
                      }
                      rightSection={
                        <Text size="xs" span opacity={0.75}>
                          {rulesetCount(option.value)}
                        </Text>
                      }
                    >
                      {option.label}
                    </Badge>
                  );
                })}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Complexity range
              </Text>
              <ComplexityRangeSlider
                value={search.complexity}
                onCommit={(value) => onSearchChange({ complexity: complexityRangeSearchValue(value) })}
              />
            </Stack>

            <Group gap="xs" justify="space-between">
              {/* A search shows no count of its matches, only the catalogue's size. */}
              <Text size="xs" c="dimmed">
                {matched === undefined || matched.count === totalCount
                  ? `${totalCount} factions`
                  : `${catalogueCountLabel(matched.count, matched.complete)} of ${totalCount} factions`}
              </Text>
              {activeCount > 0 ? (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => onSearchChange({ ruleset: undefined, complexity: undefined })}
                >
                  Clear filters
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Surface>
      </Popover.Dropdown>
    </Popover>
  );
}

/** How many factions a browsed page's filters matched; `complete` is false when the count is a floor. */
type MatchedCount = { count: number; complete: boolean };

function CatalogueToolbar({
  draftQuery,
  onDraftQueryChange,
  onCommitQuery,
  search,
  rulesets,
  matched,
  totalCount,
  onSearchChange,
}: {
  draftQuery: string;
  onDraftQueryChange: (value: string) => void;
  onCommitQuery: () => void;
  search: FactionCatalogueSearch;
  rulesets: FactionCatalogueRuleset[];
  /** Absent while searching, which shows no count. */
  matched: MatchedCount | undefined;
  totalCount: number;
  onSearchChange: (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => void;
}) {
  const rulesetOptions = useMemo(
    () => [
      { value: 'all', label: 'All rulesets' },
      ...rulesets.map((ruleset) => ({ value: ruleset.slug, label: ruleset.name })),
    ],
    [rulesets]
  );
  const rulesetSelect = (label?: string) => (
    <Select
      label={label}
      value={search.ruleset ?? 'all'}
      data={rulesetOptions}
      allowDeselect={false}
      onChange={(value) => onSearchChange({ ruleset: value === 'all' ? undefined : (value ?? undefined) })}
      aria-label="Filter factions by ruleset"
      leftSection={<Filter size={15} aria-hidden />}
    />
  );
  /* A search is always best match, so its sort has one option and takes no change; choosing an order is for browsing. */
  const sortSelect = (label?: string, joined = false) => (
    <Select
      variant={joined ? 'unstyled' : 'default'}
      label={label}
      value={search.q ? 'relevance' : (search.sort ?? 'name')}
      data={
        search.q
          ? [{ value: 'relevance', label: 'Best match' }]
          : [
              { value: 'name', label: 'Alphabetical (A–Z)' },
              { value: 'created', label: 'Chronological (created)' },
              { value: 'updated', label: 'Chronological (updated)' },
              { value: 'complexity-asc', label: 'Complexity (low → high)' },
              { value: 'complexity-desc', label: 'Complexity (high → low)' },
            ]
      }
      disabled={Boolean(search.q)}
      allowDeselect={false}
      onChange={(value) => onSearchChange({ sort: value === 'name' ? undefined : value })}
      aria-label="Sort factions"
      leftSection={<ArrowDownAZ size={15} aria-hidden />}
    />
  );
  const complexitySlider = (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Complexity range
      </Text>
      <ComplexityRangeSlider
        value={search.complexity}
        onCommit={(value) => onSearchChange({ complexity: complexityRangeSearchValue(value) })}
      />
    </Stack>
  );

  const refinements = (search.ruleset == null ? 0 : 1) + (search.complexity == null ? 0 : 1);

  return (
    <Toolbar>
      {/* No result count on the left: the grid below already shows how many matched, as on the asset shelves (Norbert, 2026-08-21), and a toolbar carries actions, not facts. */}
      <Toolbar.Center>
        <SearchRefine
          label="Faction catalogue filters"
          search={{
            value: draftQuery,
            onChange: onDraftQueryChange,
            onCommit: onCommitQuery,
            label: 'Search factions',
            placeholder: 'Search factions…',
          }}
          refine={{
            label: 'Refine factions',
            active: refinements,
            content: (
              <>
                {rulesetSelect('Ruleset')}
                {complexitySlider}
                {sortSelect('Sort by')}
              </>
            ),
          }}
        >
          <CatalogueRefine
            search={search}
            rulesetOptions={rulesetOptions}
            rulesets={rulesets}
            matched={matched}
            totalCount={totalCount}
            onSearchChange={onSearchChange}
          />
          {sortSelect(undefined, true)}
        </SearchRefine>
      </Toolbar.Center>
      <Toolbar.Right label="Faction actions">
        <IconAction
          label="Create new faction"
          emphasis="strong"
          intent="positive"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
          icon={<Plus size={17} aria-hidden />}
        />
      </Toolbar.Right>
    </Toolbar>
  );
}

function FilteredEmptyState({ complete, onReset }: { complete: boolean; onReset: () => void }) {
  return (
    <Surface padding="xl">
      <Stack gap="sm" align="center">
        <Title order={2}>No factions found</Title>
        <Text c="dimmed">Try another search or reset the catalogue filters.</Text>
        {complete ? null : (
          <Text size="xs" c="dimmed" ta="center">
            Only the first matches of this search were checked. Add a word to narrow it.
          </Text>
        )}
        <Button variant="default" onClick={onReset}>
          Reset filters &amp; search
        </Button>
      </Stack>
    </Surface>
  );
}

/** The address of one page of the current search, filters and order; the first page has no number. */
function pageSearch(page: number) {
  return (previous: FactionCatalogueSearch): FactionCatalogueSearch => ({
    ...previous,
    page: page > 1 ? page : undefined,
  });
}

/** A page past the end, from an old link or a catalogue that shrank: say where the results end and link there. */
function PastTheEnd({ pageCount }: { pageCount: number }) {
  return (
    <Surface padding="xl">
      <Stack gap="sm" align="center">
        <Title order={2}>No factions on this page</Title>
        <Text c="dimmed">
          {pageCount === 1 ? 'These results fit on one page.' : `These results end on page ${pageCount}.`}
        </Text>
        <Button
          variant="default"
          renderRoot={(props) => <Link {...props} to="/factions" search={pageSearch(pageCount)} />}
        >
          {pageCount === 1 ? 'Go to the results' : `Go to page ${pageCount}`}
        </Button>
      </Stack>
    </Surface>
  );
}

function FactionCataloguePastTheEnd({ data }: NotFoundRouteProps) {
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  return (
    <PageMessage title="Faction catalogue">
      <PastTheEnd pageCount={pageCount} />
    </PageMessage>
  );
}
