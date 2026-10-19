import { Button, MultiSelect, Pill, Stack, Text, Title, VisuallyHidden } from '@mantine/core';
import { FAQ_CATALOGUE_PAGE_SIZE } from '@shared/faq/catalogueSearch';
import { globalFaqRulesetSlugs, parseGlobalFaqSearch } from '@shared/faq/globalSearch';
import type { GlobalFaqSearch } from '@shared/faq/globalSearch';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FaqWalkthrough } from '@ui/block/FaqWalkthrough';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { useCallback, useRef } from 'react';

import { loadGlobalFaqPage, loadGlobalFaqRulesetOptions, useGlobalFaqPage, useGlobalFaqRulesetOptions } from '@db/faq';
import type { GlobalFaqArgs, GlobalFaqPageData, GlobalFaqRulesetOptions } from '@db/faq';
import { useFocusFirstNewRow, useGrowingLimit, useGrowingSearch } from '@app/routes/growingSearch';
import { publicPageHead, useLivePageTitle } from '@app/routes/publicPage';
import { useSearchDraft } from '@app/routes/searchDraft';

import styles from './index.module.css';

const PAGE_NAME = 'Community FAQ';

/** How many matches a search shows at first, and how many more each "Load more" asks for. */
const FAQ_SEARCH_STEP = FAQ_CATALOGUE_PAGE_SIZE;

/** What the page asks of the search for a parsed address; every key is spelled out so the loader deps compare equal however the address was written. */
function faqDeps(search: GlobalFaqSearch) {
  return { q: search.q, rulesets: globalFaqRulesetSlugs(search) };
}

type FaqDeps = ReturnType<typeof faqDeps>;

/** The search's arguments at one limit, with the limit always spelled out so the loader and the page share one subscription. */
function faqArgs(deps: FaqDeps, limit: number): GlobalFaqArgs {
  return { ...deps, limit };
}

/**
 * Before anything is searched the page shows how the FAQ works, not results, so it asks the search for nothing: the plain `/faq` makes one query, for the ruleset picker, and the answer it would have got is known here.
 */
function unsearched(deps: FaqDeps): GlobalFaqPageData {
  return { selected: deps.rulesets, searched: false, items: [], hasMore: false, capped: false, limit: FAQ_SEARCH_STEP };
}

/** The search parameters a change writes. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof GlobalFaqSearch, unknown>>) {
  return parseGlobalFaqSearch({ ...previous, ...patch });
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
  validateSearch: parseGlobalFaqSearch,
  loaderDeps: ({ search }) => faqDeps(search),
  loader: async ({ deps }) => {
    /* The picker's options are one held answer for every search, so the page's own query stays the one that changes. */
    const [page, rulesets] = await Promise.all([
      deps.q ? loadGlobalFaqPage(faqArgs(deps, FAQ_SEARCH_STEP)) : unsearched(deps),
      loadGlobalFaqRulesetOptions(),
    ]);
    return { page, rulesets };
  },
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
                  <RulesetSelect label="Rulesets" options={rulesets} value={deps.rulesets} onChange={changeRulesets} />
                ),
                active: deps.rulesets.length,
              }}
            >
              <RulesetSelect options={rulesets} value={deps.rulesets} onChange={changeRulesets} />
            </SearchRefine>
          </Toolbar.Center>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          {deps.q ? (
            <FaqResults deps={deps} initial={loaderData.page} />
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
type MultiSelectProps = Parameters<typeof MultiSelect>[0];

const renderRulesetOption: NonNullable<MultiSelectProps['renderOption']> = ({ option }) => (
  <span className={styles.rulesetOption}>
    <span>{option.label}</span>
    <Text component="span" size="xs" c="dimmed">
      {(option as RulesetChoice).questions}
    </Text>
  </span>
);

/** Shows the first picked ruleset and folds the rest into one "+N" pill, so the toolbar stays one line. */
function summaryPill(value: string[]): NonNullable<MultiSelectProps['renderPill']> {
  return ({ option, value: picked, onRemove }) => {
    /* A picked ruleset with no questions yet is not among the options, so Mantine hands over no option for it and the slug stands in for its name. */
    const slug = String(picked ?? option?.value);
    const index = value.indexOf(slug);
    if (index === 0) {
      return (
        <Pill withRemoveButton onRemove={onRemove}>
          {option?.label ?? slug}
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
  };
}

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
      renderOption={renderRulesetOption}
      renderPill={inToolbar ? summaryPill(value) : undefined}
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

/** The list's rows, as the kit renders them: each is the link that opens its question. */
const QUESTION_ROW = 'tr[role="link"]';

/** The live matches of one search at one limit; the growing list asks for a longer one through it. */
function useFaqRows(deps: FaqDeps, limit: number) {
  return useGlobalFaqPage(faqArgs(deps, limit)).data;
}

function FaqResults({ deps, initial }: { deps: FaqDeps; initial: GlobalFaqPageData }) {
  const growing = useGrowingLimit(deps, FAQ_SEARCH_STEP);
  const live = useFaqRows(deps, growing.limit);
  const { data, loading, loaded, grown, loadMore } = useGrowingSearch({
    search: growing,
    initial,
    live,
    rows: (page) => page.items.length,
  });
  const openQuestion = useNavigate();
  const list = useRef<HTMLDivElement>(null);
  useFocusFirstNewRow(list, loaded, grown, QUESTION_ROW);

  if (data.items.length === 0) {
    return <NothingMatches capped={data.capped} />;
  }
  return (
    <Stack gap="lg" aria-busy={loading} ref={list}>
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
      {/* The rows say how many arrived; this says only that they did, so a reader hears the list grow without a count the page never shows. */}
      <VisuallyHidden role="status" aria-live="polite">
        {loaded ? 'More questions loaded' : null}
      </VisuallyHidden>
      {data.hasMore ? <LoadMoreButton loading={loading} onLoadMore={loadMore} /> : null}
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
          {capped
            ? 'No question matches this search among those checked, and some were not. A word or two more might help.'
            : 'No question matches this search in the rulesets picked.'}
        </Text>
      </Stack>
    </Surface>
  );
}
