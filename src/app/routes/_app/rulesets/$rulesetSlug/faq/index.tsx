import { Button, Select, Stack, Text, Title, VisuallyHidden } from '@mantine/core';
import { FAQ_CATALOGUE_PAGE_SIZE, parseFaqCatalogueSearch } from '@shared/faq/catalogueSearch';
import type { FaqCatalogueSearch } from '@shared/faq/catalogueSearch';
import { FAQ_TAG_VALUES } from '@shared/faq/tags';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { PageIdentity } from '@ui/block/PageIdentity';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { CataloguePager } from '@ui/control/CataloguePager';
import { IconAction } from '@ui/control/IconAction';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, MessageCircleQuestionMark } from 'lucide-react';
import { useCallback, useRef } from 'react';
import type { Ref } from 'react';

import { loadRulesetFaqPage, useRulesetFaqPage } from '@db/faq';
import type { RulesetFaqArgs, RulesetFaqBrowseData, RulesetFaqPageData, RulesetFaqSearchData } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { useFocusFirstNewRow, useGrowingSearch } from '@app/routes/growingSearch';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

const ALL_TAGS = '__all__';

/** How many matches a search shows at first, and how many more each "Load more" asks for. */
const SEARCH_STEP = FAQ_CATALOGUE_PAGE_SIZE;

/** The list's rows, as the kit renders them: each is the link that opens its question. */
const QUESTION_ROW = 'tr[role="link"]';

/** The page query's arguments for a parsed address; every key is spelled out so the loader deps compare equal however the address was written. */
function faqDeps(search: FaqCatalogueSearch) {
  return { q: search.q, tag: search.tag, page: search.page };
}

/** What one FAQ page asks for before its limit: the ruleset and the parsed address. */
type FaqArgs = { rulesetSlug: string } & ReturnType<typeof faqDeps>;

/** The query's arguments at one limit: a search asks for its best matches up to it, a browsed page ignores it. */
function faqQueryArgs(args: FaqArgs, limit: number): RulesetFaqArgs {
  return { ...args, limit: args.q ? limit : undefined };
}

/** The live FAQ for a parsed address at one limit; the growing list asks for a longer one through it. */
function useFaqRows(args: FaqArgs, limit: number) {
  /* A live null is a ruleset deleted while open; the last page stays until the reader leaves. */
  return useRulesetFaqPage(faqQueryArgs(args, limit)).data ?? undefined;
}

/** The search parameters a change writes: any change but a page turn starts again from the first page. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof FaqCatalogueSearch, unknown>>) {
  return parseFaqCatalogueSearch({ ...previous, page: undefined, ...patch });
}

/** The address of one page of the current search and tag; the first page has no number. */
function pageSearch(page: number) {
  return (previous: FaqCatalogueSearch): FaqCatalogueSearch => ({
    ...previous,
    page: page > 1 ? page : undefined,
  });
}

/** The page's name in its title: the ruleset's, and the page number past the first; the title adds that it is the FAQ. */
function faqPageName(rulesetName: string, page: number | undefined) {
  return page ? `${rulesetName}, page ${page}` : rulesetName;
}

/** A search or a tag narrows the FAQ; only the plain FAQ's pages are worth a search engine's time, as the rest are the same questions again. */
function isRefined(search: FaqCatalogueSearch) {
  return search.q != null || search.tag != null;
}

/** The page number worth naming and indexing: none on the first page or on a refined one. */
function indexedPage(search: FaqCatalogueSearch) {
  return isRefined(search) ? undefined : search.page;
}

function noindex<T extends { meta?: unknown[] }>(head: T) {
  return { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] };
}

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseFaqCatalogueSearch,
  loaderDeps: ({ search }) => faqDeps(search),
  loader: async ({ params, deps }) => {
    const data = await loadRulesetFaqPage(faqQueryArgs({ rulesetSlug: params.rulesetSlug, ...deps }, SEARCH_STEP));
    if (!data) {
      throw notFound();
    }
    /* A browsed page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (!('mode' in data) && data.page > data.pageCount) {
      throw notFound({ data: { pageCount: data.pageCount } });
    }
    return data;
  },
  notFoundComponent: RulesetFaqNotFound,
  head: ({ loaderData, params, match }) => {
    const search = parseFaqCatalogueSearch(match.search);
    const page = indexedPage(search);
    const ruleset = loaderData?.ruleset;
    const rulesetPath = `/rulesets/${encodeURIComponent(ruleset?.slug ?? params.rulesetSlug)}`;
    const head = publicPageHead({
      name: faqPageName(ruleset?.name ?? 'Ruleset', page),
      kind: ruleset && 'FAQ',
      pathname: page ? `${rulesetPath}/faq?page=${page}` : `${rulesetPath}/faq`,
      description: ruleset ? `Community questions and accepted answers for ${ruleset.name}.` : '',
      social: { kind: 'FAQ', shape: 'portrait' },
      trail: [
        { name: 'Rulesets', pathname: '/rulesets' },
        ...(ruleset ? [{ name: ruleset.name, pathname: rulesetPath }] : []),
      ],
      match,
    });
    return isRefined(search) ? noindex(head) : head;
  },
  component: RulesetFaqPage,
});

function RulesetFaqPage() {
  const { rulesetSlug } = Route.useParams();
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    args: { rulesetSlug, ...deps },
    step: SEARCH_STEP,
    initial: loaderData,
    useLive: useFaqRows,
    rows: (page) => page.items.length,
  });
  const list = useRef<HTMLDivElement>(null);
  useFocusFirstNewRow(list, loaded, grown, QUESTION_ROW);
  const profile = useCurrentProfile();

  /* Every write re-parses, so a default never reaches the address. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof FaqCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);
  useLivePageTitle(faqPageName(data.ruleset.name, indexedPage(search)), 'FAQ');
  const changeTag = (tag: string | undefined) => changeSearch({ tag });

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title="Community FAQ"
          breadcrumb={
            <PageIdentity.Breadcrumb to="/rulesets/$rulesetSlug" params={{ rulesetSlug: data.ruleset.slug }}>
              {data.ruleset.name}
            </PageIdentity.Breadcrumb>
          }
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            <IconAction
              label={`Back to ${data.ruleset.name}`}
              emphasis="standard"
              intent="neutral"
              size="lg"
              icon={<ArrowLeft size={17} aria-hidden />}
              renderRoot={(rootProps) => (
                <Link {...rootProps} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: data.ruleset.slug }} />
              )}
            />
          </Toolbar.Left>
          <Toolbar.Center>
            <SearchRefine
              label="FAQ filters"
              search={{
                value: query.value,
                onChange: query.change,
                onCommit: query.commit,
                label: 'Search FAQ questions',
                placeholder: 'Search questions…',
              }}
              refine={{
                label: 'Refine questions',
                content: <FaqTagSelect label="Tag" tag={search.tag} onChange={changeTag} />,
                active: search.tag ? 1 : 0,
              }}
            >
              <FaqTagSelect tag={search.tag} onChange={changeTag} />
            </SearchRefine>
          </Toolbar.Center>
          <Toolbar.Right label="FAQ actions">
            {profile.data?._id ? <AskQuestion rulesetSlug={data.ruleset.slug} /> : null}
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <FaqResults
          data={data}
          refined={isRefined(search)}
          loading={loading}
          loaded={loaded}
          onLoadMore={loadMore}
          ref={list}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The tag filter: a bare segment in the toolbar, or a labelled field where the refine panel holds it. */
function FaqTagSelect({
  label,
  tag,
  onChange,
}: {
  label?: string;
  tag: string | undefined;
  onChange: (tag: string | undefined) => void;
}) {
  const inToolbar = label == null;
  return (
    <Select
      className={inToolbar ? styles.tagSegment : undefined}
      variant={inToolbar ? 'unstyled' : 'default'}
      label={label}
      aria-label={inToolbar ? 'Tag' : undefined}
      allowDeselect={false}
      data={[
        { value: ALL_TAGS, label: 'All tags' },
        ...FAQ_TAG_VALUES.map((value) => ({ value, label: FAQ_TAG_LABELS[value] })),
      ]}
      value={tag ?? ALL_TAGS}
      onChange={(value) => onChange(value === ALL_TAGS ? undefined : (value ?? undefined))}
    />
  );
}

function AskQuestion({ rulesetSlug }: { rulesetSlug: string }) {
  return (
    <IconAction
      label="Ask a question"
      emphasis="strong"
      intent="positive"
      size="lg"
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/rulesets/$rulesetSlug/faq/create" params={{ rulesetSlug }} />
      )}
      icon={<MessageCircleQuestionMark size={17} aria-hidden />}
    />
  );
}

/** Opens a question of this ruleset; the page navigates, the list only says which row was picked. */
function useOpenQuestion(rulesetSlug: string) {
  const navigate = useNavigate();
  return (questionSlug: string) =>
    navigate({ to: '/rulesets/$rulesetSlug/faq/$questionSlug', params: { rulesetSlug, questionSlug } });
}

type FaqResultsProps = {
  data: NonNullable<RulesetFaqPageData>;
  refined: boolean;
  loading: boolean;
  /** Whether the longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  ref: Ref<HTMLDivElement>;
};

/** The page's body: a search's matches, or a browsed page with its pager. */
function FaqResults({ data, refined, loading, loaded, onLoadMore, ref }: FaqResultsProps) {
  if ('mode' in data) {
    return <SearchedFaq data={data} loading={loading} loaded={loaded} onLoadMore={onLoadMore} ref={ref} />;
  }
  return <BrowsedFaq data={data} refined={refined} />;
}

/** One page of the browsed FAQ with its pager, or why there is none: nothing matches the tag, or the address is past the last page. */
function BrowsedFaq({ data, refined }: { data: RulesetFaqBrowseData; refined: boolean }) {
  const openQuestion = useOpenQuestion(data.ruleset.slug);
  if (data.total === 0 && refined) {
    return <NothingMatches capped={!data.complete} />;
  }
  if (data.page > 1 && data.items.length === 0) {
    return (
      <Surface padding="xl">
        <PastTheEnd rulesetSlug={data.ruleset.slug} pageCount={data.pageCount} />
      </Surface>
    );
  }
  return (
    <Stack gap="lg">
      <FaqList
        emptyLabel="No FAQ items yet."
        items={data.items}
        rulesetSlug={data.ruleset.slug}
        onOpenQuestion={openQuestion}
      />
      {data.total > 0 ? (
        <CataloguePager
          page={data.page}
          pageCount={data.pageCount}
          pageSize={data.pageSize}
          total={data.total}
          complete={data.complete}
          noun="questions"
          label="FAQ pages"
          pageLinkProps={(page) => ({
            component: Link,
            to: '/rulesets/$rulesetSlug/faq',
            params: { rulesetSlug: data.ruleset.slug },
            search: pageSearch(page),
          })}
        />
      ) : null}
    </Stack>
  );
}

/**
 * The best matches of a search, and a "Load more" that asks for a longer list while there is one: no count and no pages.
 * When the longer list arrives, focus moves to its first new row, so a keyboard reader carries on from where the list grew.
 */
function SearchedFaq({
  data,
  loading,
  loaded,
  onLoadMore,
  ref,
}: {
  data: RulesetFaqSearchData;
  loading: boolean;
  /** Whether the longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  ref: Ref<HTMLDivElement>;
}) {
  const openQuestion = useOpenQuestion(data.ruleset.slug);
  if (data.items.length === 0) {
    return <NothingMatches capped={data.capped} />;
  }
  return (
    <Stack gap="lg" aria-busy={loading} ref={ref}>
      <FaqList
        emptyLabel="No questions match."
        items={data.items}
        rulesetSlug={data.ruleset.slug}
        onOpenQuestion={openQuestion}
      />
      {/* The rows say how many arrived; this says only that they did, so a reader hears the list grow without a count the page never shows. */}
      <VisuallyHidden role="status" aria-live="polite">
        {loaded ? 'More questions loaded' : null}
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

/** No match among the questions checked; a capped search did not check them all, so another word may still find one. */
function NothingMatches({ capped }: { capped: boolean }) {
  return (
    <Surface padding="xl">
      <Stack gap="xs" align="center">
        <Title order={2}>Nothing matches</Title>
        <Text c="dimmed" ta="center">
          No question matches this search.
        </Text>
        {capped ? (
          <Text size="xs" c="dimmed" ta="center">
            Only the first matches of this search were checked. Add a word to narrow it.
          </Text>
        ) : null}
      </Stack>
    </Surface>
  );
}

/** A page past the end, from an old link or an FAQ that shrank: say where the results end and link there. */
function PastTheEnd({ rulesetSlug, pageCount }: { rulesetSlug: string; pageCount: number }) {
  return (
    <Stack gap="sm" align="center">
      <Title order={2}>Nothing on this page</Title>
      <Text c="dimmed">
        {pageCount === 1 ? 'These results fit on one page.' : `These results end on page ${pageCount}.`}
      </Text>
      <Button
        variant="default"
        renderRoot={(props) => (
          <Link {...props} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug }} search={pageSearch(pageCount)} />
        )}
      >
        {pageCount === 1 ? 'Go to the results' : `Go to page ${pageCount}`}
      </Button>
    </Stack>
  );
}

/** An unknown ruleset, or a page past the end, which carries where the results end. */
function RulesetFaqNotFound({ data }: NotFoundRouteProps) {
  const { rulesetSlug } = Route.useParams();
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount;
  return (
    <PageMessage title="Community FAQ">
      {pageCount == null ? (
        <Text c="dimmed">This ruleset does not exist or was deleted.</Text>
      ) : (
        <PastTheEnd rulesetSlug={rulesetSlug} pageCount={pageCount} />
      )}
    </PageMessage>
  );
}
