import { Group, Select, Stack } from '@mantine/core';
import { PROFILE_CATALOGUE_PAGE_SIZE, parseProfileCatalogueSearch } from '@shared/profiles/catalogueSearch';
import type { ProfileCatalogueSearch } from '@shared/profiles/catalogueSearch';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { EmptyResults, PastTheEnd } from '@ui/block/EmptyResults';
import { PageTitle } from '@ui/block/PageTitle';
import { ProfileLink } from '@ui/content/ProfileLink';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { CircleHelp, MessageCircleReply, Shield, UsersRound } from 'lucide-react';
import { useCallback, useRef } from 'react';
import type { Ref } from 'react';

import { loadProfileDirectoryPage, useProfileDirectoryPage } from '@db/profiles';
import type { ProfileDirectoryArgs, ProfileDirectoryEntry, ProfileDirectoryPageData } from '@db/profiles';
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
function directoryDeps(search: ProfileCatalogueSearch) {
  const parsed = parseProfileCatalogueSearch(search);
  return { q: parsed.q, sort: parsed.sort, page: parsed.page };
}

/** How many rows a search shows at first, and how many more each "Load more" asks for. */
const SEARCH_STEP = PROFILE_CATALOGUE_PAGE_SIZE;

/** The rows' links, as the list renders them, in their order. */
const ROW_LINK = 'a[href^="/profiles/"]';

/** The query's arguments at one limit: a search asks for its best matches up to it, a browsed page ignores it. */
function catalogueQueryArgs(args: ProfileDirectoryArgs, limit: number): ProfileDirectoryArgs {
  return { ...args, limit: args.q ? limit : undefined };
}

/** The live directory for a parsed address at one limit; the growing list asks for a longer one through it. */
function useDirectoryRows(args: ProfileDirectoryArgs, limit: number) {
  return useProfileDirectoryPage(catalogueQueryArgs(args, limit)).data;
}

/** The search parameters a change writes: any change but a page turn starts again from the first page. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof ProfileCatalogueSearch, unknown>>) {
  return parseProfileCatalogueSearch({ ...previous, page: undefined, ...patch });
}

/** The address of one page of the current search and order; the first page has no number. */
function pageSearch(page: number) {
  return (previous: ProfileCatalogueSearch): ProfileCatalogueSearch => ({
    ...previous,
    page: page > 1 ? page : undefined,
  });
}

export const Route = createFileRoute('/_app/profiles/')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseProfileCatalogueSearch,
  loaderDeps: ({ search }) => directoryDeps(search),
  loader: async ({ deps }) => {
    const data = await loadProfileDirectoryPage(catalogueQueryArgs(deps, SEARCH_STEP));
    /* A browsed page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (!('mode' in data) && data.page > data.pageCount) {
      throw notFound({ data: { pageCount: data.pageCount } });
    }
    return data;
  },
  notFoundComponent: ProfilesPastTheEnd,
  head: ({ match }) => {
    const search = parseProfileCatalogueSearch(match.search);
    const refined = search.q != null || search.sort != null;
    const head = publicPageHead({
      /* Only the plain directory's pages are worth a search engine's time; a search or an order is the same profiles again. */
      name: search.page && !refined ? `Dune board game creators, page ${search.page}` : 'Dune board game creators',
      pathname: search.page && !refined ? `/profiles?page=${search.page}` : '/profiles',
      description:
        "Meet the Dune board game community on Dune Zone. Explore creators' factions, rulesets and Groups, and their contributions to rules questions.",
      social: { kind: 'Community', shape: 'round' },
      match,
    });
    return refined ? { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] } : head;
  },
  component: ProfilesPage,
});

function ProfilesPage() {
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const growing = useGrowingLimit(deps, SEARCH_STEP);
  const live = useDirectoryRows(deps, growing.limit);
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    search: growing,
    initial: loaderData,
    live,
    rows: (page) => page.entries.length,
  });
  const list = useRef<HTMLDivElement>(null);
  useFocusFirstNewRow(list, loaded, grown, ROW_LINK);

  /* Every write re-parses, so a default never reaches the address. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof ProfileCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);

  /* A search is always best match, so its sort takes no change; choosing an order is for browsing. */
  const sortSelect = (label?: string) => (
    <Select
      className={label ? undefined : styles.sortSegment}
      variant={label ? 'default' : 'unstyled'}
      label={label}
      aria-label="Sort"
      allowDeselect={false}
      data={sortOptions(Boolean(search.q))}
      value={search.q ? 'relevance' : (search.sort ?? 'name')}
      disabled={Boolean(search.q)}
      onChange={(value) => changeSearch({ sort: value === 'name' ? undefined : value })}
    />
  );

  return (
    <PageLayout>
      <PageLayout.Header>
        <PageTitle title="Profiles" />
      </PageLayout.Header>
      {data.directoryTotal > 0 ? (
        <PageLayout.Toolbar>
          <Toolbar>
            <Toolbar.Center>
              <SearchRefine
                label="Profile filters"
                search={{
                  value: query.value,
                  onChange: query.change,
                  onCommit: query.commit,
                  label: 'Search profiles',
                  placeholder: 'Search profiles…',
                }}
                refine={{ label: 'Refine profiles', content: sortSelect('Sort by') }}
              >
                {sortSelect()}
              </SearchRefine>
            </Toolbar.Center>
          </Toolbar>
        </PageLayout.Toolbar>
      ) : null}
      <PageLayout.Content>
        <DirectoryContent data={data} loading={loading} loaded={loaded} onLoadMore={loadMore} ref={list} />
      </PageLayout.Content>
    </PageLayout>
  );
}

type DirectoryContentProps = {
  data: ProfileDirectoryPageData;
  loading: boolean;
  /** Whether the longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  ref: Ref<HTMLDivElement>;
};

/** The page's body: an empty directory, a search, or a browsed page. */
function DirectoryContent({ data, loading, loaded, onLoadMore, ref }: DirectoryContentProps) {
  if (data.directoryTotal === 0) {
    return (
      <Surface padding="xl">
        <EmptyResults title="Nothing here yet">No one has made a profile so far.</EmptyResults>
      </Surface>
    );
  }
  return (
    <CatalogueResults
      results={
        'mode' in data
          ? { kind: 'search', ...data, loading, loaded, onLoadMore }
          : { kind: 'browse', ...data, pagerLabel: 'Profile pages', pageLinkProps: profilePageLink }
      }
      noun="profiles"
      noMatches="No profile matches this search."
      renderEntries={(entries) => <ProfileRows entries={entries} />}
      ref={ref}
    />
  );
}

/** The link to one page of the browsed directory. */
function profilePageLink(page: number) {
  return { component: Link, to: '/profiles', search: pageSearch(page) };
}

function ProfileRows({ entries }: { entries: readonly ProfileDirectoryEntry[] }) {
  return (
    <Surface padding="lg">
      <Stack component="ul" gap="xs" className={styles.list}>
        {entries.map((entry) => (
          <ProfileRow key={entry.id} entry={entry} />
        ))}
      </Stack>
    </Surface>
  );
}

function ProfileRow({ entry }: { entry: ProfileDirectoryEntry }) {
  const { activity } = entry;
  return (
    <li>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <ProfileLink slug={entry.slug} name={entry.name} image={entry.image} />
        <Stats
          items={[
            {
              key: 'groups',
              icon: <UsersRound size={16} aria-hidden />,
              value: activity.groupCount,
              label: `Groups: ${activity.groupCount}`,
            },
            {
              key: 'factions',
              icon: <Shield size={16} aria-hidden />,
              value: activity.factionCount,
              label: `Factions owned: ${activity.factionCount}`,
            },
            {
              key: 'questions',
              icon: <CircleHelp size={16} aria-hidden />,
              value: activity.questionCount,
              label: `Questions asked: ${activity.questionCount}`,
            },
            {
              key: 'answers',
              icon: <MessageCircleReply size={16} aria-hidden />,
              value: activity.answerCount,
              label: `Answers given: ${activity.answerCount}`,
            },
          ]}
        />
      </Group>
    </li>
  );
}

function ProfilesPastTheEnd({ data }: NotFoundRouteProps) {
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  return (
    <PageMessage title="Profiles">
      <PastTheEnd pageCount={pageCount} noun="profiles" pageLinkProps={profilePageLink} />
    </PageMessage>
  );
}
