import { Select } from '@mantine/core';
import { FAQ_CATALOGUE_PAGE_SIZE, parseFaqCatalogueSearch } from '@shared/faq/catalogueSearch';
import type { FaqCatalogueSearch } from '@shared/faq/catalogueSearch';
import { FAQ_TAG_VALUES } from '@shared/faq/tags';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { EmptyResults, PastTheEnd } from '@ui/block/EmptyResults';
import { PageIdentity } from '@ui/block/PageIdentity';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, MessageCircleQuestionMark } from 'lucide-react';
import { useCallback, useRef } from 'react';
import type { Ref } from 'react';

import { loadRulesetFaqPage, useRulesetFaqPage } from '@db/faq';
import type { RulesetFaqArgs, RulesetFaqPageData } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { useFocusFirstNewRow, useGrowingLimit, useGrowingSearch } from '@app/routes/growingSearch';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { NotFoundState } from '@app/routes/routeStates';
import { useSearchDraft } from '@app/routes/searchDraft';
import { CatalogueResults } from '@app/widgets/catalogue-results/CatalogueResults';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

const ALL_TAGS = '__all__';

/** How many matches a search shows at first, and how many more each "Load more" asks for. */
const SEARCH_STEP = FAQ_CATALOGUE_PAGE_SIZE;

/** The list's rows, as the kit renders them: each is the link that opens its question. */
const QUESTION_ROW = 'tr[role="link"]';

/**
 * The page query's arguments for an address, parsed again since the router keeps a parameter the parser dropped, such as an old link's page beside a search;
 * every key is spelled out so the loader deps compare equal however the address was written.
 */
function faqDeps(search: FaqCatalogueSearch) {
  const parsed = parseFaqCatalogueSearch(search);
  return { q: parsed.q, tag: parsed.tag, page: parsed.page };
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
  const growing = useGrowingLimit({ rulesetSlug, ...deps }, SEARCH_STEP);
  const live = useFaqRows({ rulesetSlug, ...deps }, growing.limit);
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    search: growing,
    initial: loaderData,
    live,
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

/** The page's body: a search's matches, or a browsed page with its pager; an unrefined FAQ with nothing in it yet says so in its own words. */
function FaqResults({ data, refined, loading, loaded, onLoadMore, ref }: FaqResultsProps) {
  const openQuestion = useOpenQuestion(data.ruleset.slug);
  const rulesetSlug = data.ruleset.slug;
  const renderList = (items: typeof data.items) => (
    <FaqList emptyLabel="No FAQ items yet." items={items} rulesetSlug={rulesetSlug} onOpenQuestion={openQuestion} />
  );
  if (!refined && !('mode' in data) && data.total === 0) {
    return (
      <Surface padding="xl">
        <EmptyResults title="Nothing here yet">No questions have been asked yet.</EmptyResults>
      </Surface>
    );
  }
  return (
    <CatalogueResults
      results={
        'mode' in data
          ? {
              kind: 'search',
              entries: data.items,
              hasMore: data.hasMore,
              capped: data.capped,
              loading,
              loaded,
              onLoadMore,
            }
          : {
              kind: 'browse',
              ...data,
              entries: data.items,
              pagerLabel: 'FAQ pages',
              pageLinkProps: (page) => faqPageLink(rulesetSlug, page),
            }
      }
      noun="questions"
      noMatches="No question matches this search."
      renderEntries={renderList}
      ref={ref}
    />
  );
}

/** The link to one page of a ruleset's browsed FAQ. */
function faqPageLink(rulesetSlug: string, page: number) {
  return { component: Link, to: '/rulesets/$rulesetSlug/faq', params: { rulesetSlug }, search: pageSearch(page) };
}

/** An unknown ruleset, or a page past the end, which carries where the results end. */
function RulesetFaqNotFound({ data }: NotFoundRouteProps) {
  const { rulesetSlug } = Route.useParams();
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount;
  return (
    <PageMessage title="Community FAQ">
      {pageCount == null ? (
        <NotFoundState noun="ruleset" />
      ) : (
        <PastTheEnd pageCount={pageCount} noun="questions" pageLinkProps={(page) => faqPageLink(rulesetSlug, page)} />
      )}
    </PageMessage>
  );
}
