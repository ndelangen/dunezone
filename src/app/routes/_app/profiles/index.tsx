import { Button, Group, Select, Stack, Text, Title } from '@mantine/core';
import { parseProfileCatalogueSearch } from '@shared/profiles/catalogueSearch';
import type { ProfileCatalogueSearch } from '@shared/profiles/catalogueSearch';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { ProfileLink } from '@ui/content/ProfileLink';
import { CataloguePager } from '@ui/control/CataloguePager';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { CircleHelp, MessageCircleReply, Shield, UsersRound } from 'lucide-react';
import { useCallback } from 'react';

import { loadProfileDirectoryPage, useProfileDirectoryPage } from '@db/profiles';
import type { ProfileDirectoryEntry } from '@db/profiles';
import { publicPageHead } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

/** The sort control's options; best match exists only while searching, and is the default then. */
function sortOptions(searching: boolean) {
  return [
    ...(searching ? [{ value: 'relevance', label: 'Best match' }] : []),
    { value: 'name', label: 'Alphabetical (A–Z)' },
    { value: 'newest', label: 'Newest' },
  ];
}

/** The page query's arguments for a parsed address; every key is spelled out so the loader deps compare equal however the address was written. */
function directoryDeps(search: ProfileCatalogueSearch) {
  return { q: search.q, sort: search.sort, page: search.page };
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
    const data = await loadProfileDirectoryPage(deps);
    /* A page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (data.page > data.pageCount) {
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
  const live = useProfileDirectoryPage(deps, { initialData: loaderData });
  const data = live.data ?? loaderData;

  /* Every write re-parses, so a default never reaches the address. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof ProfileCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);

  const sortSelect = (label?: string) => (
    <Select
      className={label ? undefined : styles.sortSegment}
      variant={label ? 'default' : 'unstyled'}
      label={label}
      aria-label="Sort"
      allowDeselect={false}
      data={sortOptions(Boolean(search.q))}
      value={search.sort ?? (search.q ? 'relevance' : 'name')}
      onChange={(value) =>
        changeSearch({ sort: value === 'relevance' || (value === 'name' && !search.q) ? undefined : value })
      }
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
        {data.directoryTotal === 0 ? (
          <Text size="sm" c="dimmed">
            No profiles yet.
          </Text>
        ) : data.total === 0 ? (
          <Surface padding="xl">
            <Stack gap="xs" align="center">
              <Title order={2}>Nothing matches</Title>
              <Text c="dimmed" ta="center">
                No profile matches this search.
              </Text>
              {data.complete ? null : (
                <Text size="xs" c="dimmed" ta="center">
                  Only the first matches of this search were checked. Add a word to narrow it.
                </Text>
              )}
            </Stack>
          </Surface>
        ) : data.entries.length === 0 ? (
          <Surface padding="xl">
            <PastTheEnd pageCount={data.pageCount} />
          </Surface>
        ) : (
          <Stack gap="lg" aria-busy={live.isPending}>
            <Surface padding="lg">
              <Stack component="ul" gap="xs" className={styles.list}>
                {data.entries.map((entry) => (
                  <ProfileRow key={entry.id} entry={entry} />
                ))}
              </Stack>
            </Surface>
            <CataloguePager
              page={data.page}
              pageCount={data.pageCount}
              pageSize={data.pageSize}
              total={data.total}
              complete={data.complete}
              noun="profiles"
              label="Profile pages"
              pageLinkProps={(page) => ({ component: Link, to: '/profiles', search: pageSearch(page) })}
            />
          </Stack>
        )}
      </PageLayout.Content>
    </PageLayout>
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

/** A page past the end, from an old link or a directory that shrank: say where the results end and link there. */
function PastTheEnd({ pageCount }: { pageCount: number }) {
  return (
    <Stack gap="sm" align="center">
      <Title order={2}>Nothing on this page</Title>
      <Text c="dimmed">
        {pageCount === 1 ? 'These results fit on one page.' : `These results end on page ${pageCount}.`}
      </Text>
      <Button
        variant="default"
        renderRoot={(props) => <Link {...props} to="/profiles" search={pageSearch(pageCount)} />}
      >
        {pageCount === 1 ? 'Go to the results' : `Go to page ${pageCount}`}
      </Button>
    </Stack>
  );
}

function ProfilesPastTheEnd({ data }: NotFoundRouteProps) {
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  return (
    <PageMessage title="Profiles">
      <PastTheEnd pageCount={pageCount} />
    </PageMessage>
  );
}
