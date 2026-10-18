import { Button, Select, Stack, Text, Title } from '@mantine/core';
import { parseFaqCatalogueSearch } from '@shared/faq/catalogueSearch';
import type { FaqCatalogueSearch } from '@shared/faq/catalogueSearch';
import { FAQ_TAG_VALUES } from '@shared/faq/tags';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { PageIdentity } from '@ui/block/PageIdentity';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { CataloguePager } from '@ui/control/CataloguePager';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, MessageCircleQuestionMark } from 'lucide-react';
import { useCallback } from 'react';

import { loadRulesetFaqPage, useRulesetFaqPage } from '@db/faq';
import type { RulesetFaqPageData } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

const ALL_TAGS = '__all__';

/** The page query's arguments for a parsed address; every key is spelled out so the loader deps compare equal however the address was written. */
function faqDeps(search: FaqCatalogueSearch) {
  return { q: search.q, tag: search.tag, page: search.page };
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

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseFaqCatalogueSearch,
  loaderDeps: ({ search }) => faqDeps(search),
  loader: async ({ params, deps }) => {
    const data = await loadRulesetFaqPage({ rulesetSlug: params.rulesetSlug, ...deps });
    if (!data) {
      throw notFound();
    }
    /* A page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (data.page > data.pageCount) {
      throw notFound({ data: { pageCount: data.pageCount } });
    }
    return data;
  },
  notFoundComponent: RulesetFaqNotFound,
  head: ({ loaderData, params, match }) => {
    const search = parseFaqCatalogueSearch(match.search);
    const refined = search.q != null || search.tag != null;
    const rulesetPath = `/rulesets/${encodeURIComponent(loaderData?.ruleset.slug ?? params.rulesetSlug)}`;
    const head = publicPageHead({
      /* Only the plain FAQ's pages are worth a search engine's time; a search or a tag is the same questions again. */
      name: `${loaderData?.ruleset.name ?? 'Ruleset'} FAQ${search.page && !refined ? `, page ${search.page}` : ''}`,
      kind: loaderData ? 'FAQ' : undefined,
      pathname: `${rulesetPath}/faq${search.page && !refined ? `?page=${search.page}` : ''}`,
      description: loaderData ? `Community questions and accepted answers for ${loaderData.ruleset.name}.` : '',
      social: { kind: 'FAQ', shape: 'portrait' },
      trail: [
        { name: 'Rulesets', pathname: '/rulesets' },
        ...(loaderData ? [{ name: loaderData.ruleset.name, pathname: rulesetPath }] : []),
      ],
      match,
    });
    return refined ? { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] } : head;
  },
  component: RulesetFaqPage,
});

function RulesetFaqPage() {
  const { rulesetSlug } = Route.useParams();
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const live = useRulesetFaqPage({ rulesetSlug, ...deps }, { initialData: loaderData });
  /* A live null is a ruleset deleted while open; the last page stays until the reader leaves. */
  const data = live.data ?? loaderData;
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
  useLivePageTitle(`${data.ruleset.name} FAQ`, 'FAQ');

  const tagSelect = (label?: string) => (
    <Select
      className={label ? undefined : styles.tagSegment}
      variant={label ? 'default' : 'unstyled'}
      label={label}
      aria-label={label ? undefined : 'Tag'}
      allowDeselect={false}
      data={[
        { value: ALL_TAGS, label: 'All tags' },
        ...FAQ_TAG_VALUES.map((tag) => ({ value: tag, label: FAQ_TAG_LABELS[tag] })),
      ]}
      value={search.tag ?? ALL_TAGS}
      onChange={(value) => changeSearch({ tag: value === ALL_TAGS ? undefined : value })}
    />
  );
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
              refine={{ label: 'Refine questions', content: tagSelect('Tag') }}
            >
              {tagSelect()}
            </SearchRefine>
          </Toolbar.Center>
          <Toolbar.Right label="FAQ actions">
            {profile.data?._id ? (
              <IconAction
                label="Ask a question"
                emphasis="strong"
                intent="positive"
                size="lg"
                renderRoot={(rootProps) => (
                  <Link
                    {...rootProps}
                    to="/rulesets/$rulesetSlug/faq/create"
                    params={{ rulesetSlug: data.ruleset.slug }}
                  />
                )}
                icon={<MessageCircleQuestionMark size={17} aria-hidden />}
              />
            ) : null}
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <FaqResults data={data} refined={search.q != null || search.tag != null} pending={live.isPending} />
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The page's questions and pager, or why there are none: nothing matches, or the address is past the last page. */
function FaqResults({
  data,
  refined,
  pending,
}: {
  data: NonNullable<RulesetFaqPageData>;
  refined: boolean;
  pending: boolean;
}) {
  const openQuestion = useNavigate();
  return (
    <>
      {data.total === 0 && refined ? (
        <Surface padding="xl">
          <Stack gap="xs" align="center">
            <Title order={2}>Nothing matches</Title>
            <Text c="dimmed" ta="center">
              No question matches this search.
            </Text>
            {data.complete ? null : (
              <Text size="xs" c="dimmed" ta="center">
                Only the first matches of this search were checked. Add a word to narrow it.
              </Text>
            )}
          </Stack>
        </Surface>
      ) : data.total > 0 && data.items.length === 0 ? (
        <Surface padding="xl">
          <PastTheEnd rulesetSlug={data.ruleset.slug} pageCount={data.pageCount} />
        </Surface>
      ) : (
        <Stack gap="lg" aria-busy={pending}>
          <FaqList
            emptyLabel="No FAQ items yet."
            items={data.items}
            rulesetSlug={data.ruleset.slug}
            onOpenQuestion={(questionSlug) =>
              openQuestion({
                to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                params: { rulesetSlug: data.ruleset.slug, questionSlug },
              })
            }
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
      )}
    </>
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
