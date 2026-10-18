import { Button, MultiSelect, Pill, Stack, Text, Title, VisuallyHidden } from '@mantine/core';
import { globalFaqRulesetSlugs, parseGlobalFaqSearch } from '@shared/faq/globalSearch';
import type { GlobalFaqSearch } from '@shared/faq/globalSearch';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { FaqWalkthrough } from '@ui/block/FaqWalkthrough';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { CataloguePager } from '@ui/control/CataloguePager';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { useCallback } from 'react';

import { loadGlobalFaqPage, loadGlobalFaqRulesetOptions, useGlobalFaqPage, useGlobalFaqRulesetOptions } from '@db/faq';
import type { GlobalFaqPageData, GlobalFaqRulesetOptions } from '@db/faq';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './index.module.css';

const PAGE_NAME = 'Community FAQ';

/** The page query's arguments for a parsed address; every key is spelled out so the loader deps compare equal however the address was written. */
function faqDeps(search: GlobalFaqSearch) {
  return { q: search.q, rulesets: globalFaqRulesetSlugs(search), page: search.page };
}

/** The search parameters a change writes: any change but a page turn starts again from the first page. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof GlobalFaqSearch, unknown>>) {
  return parseGlobalFaqSearch({ ...previous, page: undefined, ...patch });
}

/** The address of one page of the current search and rulesets; the first page has no number. */
function pageSearch(page: number) {
  return (previous: GlobalFaqSearch): GlobalFaqSearch => ({
    ...previous,
    page: page > 1 ? page : undefined,
  });
}

/**
 * A search narrows the FAQ to its matches, and a ruleset pick narrows those;
 * neither page is worth a search engine's time, as the questions have pages of their own.
 * The plain page has no result pages at all, so `/faq` is this page's one indexed address.
 */
function isRefined(search: GlobalFaqSearch) {
  return search.q != null || search.rulesets != null;
}

function noindex<T extends { meta?: unknown[] }>(head: T) {
  return { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] };
}

export const Route = createFileRoute('/_app/faq/')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseGlobalFaqSearch,
  loaderDeps: ({ search }) => faqDeps(search),
  loader: async ({ deps }) => {
    /* The picker's options are one held answer for every search, so the page's own query stays the one that changes. */
    const [page, rulesets] = await Promise.all([loadGlobalFaqPage(deps), loadGlobalFaqRulesetOptions()]);
    /* A page past the end is an address that does not exist, so it answers 404 and points at the last page. */
    if (page.page > page.pageCount) {
      throw notFound({ data: { pageCount: page.pageCount } });
    }
    return { page, rulesets };
  },
  notFoundComponent: GlobalFaqNotFound,
  head: ({ match }) => {
    const search = parseGlobalFaqSearch(match.search);
    const head = publicPageHead({
      name: PAGE_NAME,
      pathname: '/faq',
      description:
        'Search community questions and accepted answers about the Dune board game across every ruleset on Dune Zone.',
      social: { kind: 'FAQ', shape: 'portrait' },
      match,
    });
    return isRefined(search) ? noindex(head) : head;
  },
  component: GlobalFaqPage,
});

function GlobalFaqPage() {
  const search = Route.useSearch();
  const deps = Route.useLoaderDeps();
  const navigate = Route.useNavigate();
  const loaderData = Route.useLoaderData();
  const live = useGlobalFaqPage(deps, { initialData: loaderData.page });
  const data = live.data ?? loaderData.page;
  const liveRulesets = useGlobalFaqRulesetOptions({ initialData: loaderData.rulesets });
  const rulesets = liveRulesets.data ?? loaderData.rulesets;

  /* Every write re-parses, so a default never reaches the address. Replacing keeps a browse session to one history entry. */
  const changeSearch = (patch: Partial<Record<keyof GlobalFaqSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);
  useLivePageTitle(PAGE_NAME);
  const changeRulesets = (rulesets: string[]) => changeSearch({ rulesets });

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title={PAGE_NAME} eyebrow="Every ruleset" />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Center>
            <SearchRefine
              label="FAQ filters"
              search={{
                value: query.value,
                onChange: query.change,
                onCommit: query.commit,
                label: 'Search FAQ questions',
                placeholder: 'Search every ruleset…',
              }}
              refine={{
                label: 'Refine questions',
                content: (
                  <RulesetSelect label="Rulesets" options={rulesets} value={data.selected} onChange={changeRulesets} />
                ),
                active: data.selected.length,
              }}
            >
              <RulesetSelect options={rulesets} value={data.selected} onChange={changeRulesets} />
            </SearchRefine>
          </Toolbar.Center>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          {data.searched ? (
            <FaqResults data={data} pending={live.isPending} />
          ) : (
            <Section
              title="How the FAQ works"
              description="Ask about a ruleset, let the table weigh in, and mark the reply that settled it."
            >
              <Surface padding="lg">
                <FaqWalkthrough
                  asker="Chani"
                  question="Can I ship troops into the storm?"
                  answers={[
                    { author: 'Stilgar', text: 'No. Shipment into a territory under the storm is never allowed.' },
                    {
                      author: 'Liet',
                      text: 'The storm blocks shipment and movement into it, and troops already there are lost when it moves over them.',
                    },
                    {
                      author: 'Jessica',
                      text: 'Unless your faction has an advantage that says otherwise. Check your sheet.',
                    },
                  ]}
                  accepted={1}
                />
              </Surface>
            </Section>
          )}
          <AskOnRuleset />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** A ruleset as the select lists it: its slug and name, and its questions for the option to show. */
type RulesetChoice = { value: string; label: string; questions: number };

/**
 * The ruleset filter: a bare segment in the toolbar, or a labelled field where the refine panel holds it.
 * Each option says how many questions it holds, and a picked one stays listed, checked, so it can be dropped from the list as well as from its pill.
 * The toolbar's segment has room for one pill, so a second pick folds the rest into a count.
 */
function RulesetSelect({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: GlobalFaqRulesetOptions;
  value: string[];
  onChange: (slugs: string[]) => void;
}) {
  const inToolbar = label == null;
  const data: RulesetChoice[] = options.map((option) => ({
    value: option.slug,
    label: option.name,
    questions: option.questions,
  }));
  return (
    <MultiSelect
      className={inToolbar ? styles.rulesetSegment : undefined}
      classNames={inToolbar ? { pillsList: styles.pillsRow } : undefined}
      variant={inToolbar ? 'unstyled' : 'default'}
      label={label}
      aria-label={inToolbar ? 'Rulesets' : undefined}
      placeholder={value.length === 0 ? 'All rulesets' : undefined}
      data={data}
      renderOption={({ option }) => (
        <span className={styles.rulesetOption}>
          <span>{option.label}</span>
          <Text component="span" size="xs" c="dimmed">
            {(option as RulesetChoice).questions}
          </Text>
        </span>
      )}
      renderPill={
        inToolbar
          ? ({ option, value: picked, onRemove }) => {
              /* A picked ruleset with no questions yet is not among the options, so Mantine hands over no option for it and the slug stands in for its name. */
              const slug = String(picked ?? option?.value);
              const name = option?.label ?? slug;
              const index = value.indexOf(slug);
              if (index === 0) {
                return (
                  <Pill withRemoveButton onRemove={onRemove} removeButtonProps={{ 'aria-label': `Drop ${name}` }}>
                    {name}
                  </Pill>
                );
              }
              if (index !== 1) {
                return null;
              }
              const more = value.length - 1;
              return (
                <Pill>
                  <span aria-hidden>+{more}</span>
                  <VisuallyHidden>and {more} more rulesets</VisuallyHidden>
                </Pill>
              );
            }
          : undefined
      }
      value={value}
      onChange={onChange}
      clearable
      searchable={!inToolbar}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

/** The way to a question's home: questions belong to rulesets, so a new one is asked from its ruleset's page. */
function AskOnRuleset() {
  return (
    <Stack gap="xs" align="center" className={styles.ask}>
      <Text ta="center">
        Got a question of your own? Ask it on its ruleset's page, where the people who play it will see it.
      </Text>
      <Button variant="default" renderRoot={(props) => <Link {...props} to="/rulesets" />}>
        Browse the rulesets
      </Button>
    </Stack>
  );
}

/** The page's questions and pager, or why there are none: nothing matches, or the address is past the last page. */
function FaqResults({ data, pending }: { data: GlobalFaqPageData; pending: boolean }) {
  const openQuestion = useNavigate();
  return (
    <>
      {data.total === 0 ? (
        <NothingMatches complete={data.complete} />
      ) : data.page > 1 && data.items.length === 0 ? (
        <Surface padding="xl">
          <PastTheEnd pageCount={data.pageCount} />
        </Surface>
      ) : (
        <Stack gap="lg" aria-busy={pending}>
          <FaqList
            emptyLabel="No questions match."
            items={data.items}
            onOpenQuestion={(questionSlug, rulesetSlug) =>
              openQuestion({
                to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                params: { rulesetSlug, questionSlug },
              })
            }
          />
          <CataloguePager
            page={data.page}
            pageCount={data.pageCount}
            pageSize={data.pageSize}
            total={data.total}
            complete={data.complete}
            noun="questions"
            label="FAQ pages"
            pageLinkProps={(page) => ({ component: Link, to: '/faq', search: pageSearch(page) })}
          />
        </Stack>
      )}
    </>
  );
}

function NothingMatches({ complete }: { complete: boolean }) {
  return (
    <Surface padding="xl">
      <Stack gap="xs" align="center">
        <Title order={2}>Nothing matches</Title>
        <Text c="dimmed" ta="center">
          No question matches this search in the rulesets picked.
        </Text>
        {complete ? null : (
          <Text size="xs" c="dimmed" ta="center">
            Only the first matches of this search were checked. Add a word to narrow it.
          </Text>
        )}
      </Stack>
    </Surface>
  );
}

/** A page past the end of a search, from an old link or matches that went away: say where its results end and link there, with the same search. */
function PastTheEnd({ pageCount }: { pageCount: number }) {
  return (
    <Stack gap="sm" align="center">
      <Title order={2}>Nothing on this page</Title>
      <Text c="dimmed">
        {pageCount === 1 ? 'This search fits on one page.' : `This search ends on page ${pageCount}.`}
      </Text>
      <Button variant="default" renderRoot={(props) => <Link {...props} to="/faq" search={pageSearch(pageCount)} />}>
        {pageCount === 1 ? 'Go to the results' : `Go to page ${pageCount}`}
      </Button>
    </Stack>
  );
}

/** A page past the end of a search, which carries where its results end. */
function GlobalFaqNotFound({ data }: NotFoundRouteProps) {
  const pageCount = (data as { pageCount?: number } | undefined)?.pageCount ?? 1;
  return (
    <PageMessage title={PAGE_NAME}>
      <PastTheEnd pageCount={pageCount} />
    </PageMessage>
  );
}
