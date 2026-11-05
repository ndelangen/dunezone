import { Stack, Text, VisuallyHidden } from '@mantine/core';
import { EmptyResults, PastTheEnd } from '@ui/block/EmptyResults';
import { CataloguePager } from '@ui/control/CataloguePager';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { Surface } from '@ui/surface';
import type { ReactNode, Ref } from 'react';

/** One browsed page of a catalogue, as its query answers it. */
interface BrowsedResults<Entry> {
  kind: 'browse';
  entries: Entry[];
  /** The page shown, from 1. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** Matches across every page. */
  total: number;
  /** False when the filters matched more than one read can hold, so `total` is a floor. */
  complete: boolean;
}

/** The best matches of a search, grown by asking for more. */
interface SearchedResults<Entry> {
  kind: 'search';
  entries: Entry[];
  /** Whether a longer list is there to ask for. */
  hasMore: boolean;
  /** True when the search stopped before it checked everything. */
  capped: boolean;
}

export interface CatalogueResultsProps<Entry> {
  results: BrowsedResults<Entry> | SearchedResults<Entry>;
  /** What the results are, plural and lower case: "rulesets", "treachery cards". */
  noun: string;
  /** One of them, lower case, for the sentence a search that found nothing says: "ruleset". */
  singular: string;
  /** Names the page list for assistive technology: "Ruleset pages". */
  pagerLabel: string;
  /** The props that make a link to one page, such as `{ component: Link, to, search }`. */
  pageLinkProps: (page: number) => Record<string, unknown>;
  /** The results themselves: the route's own tiles, rows or cards. */
  renderTiles: (entries: Entry[]) => ReactNode;
  /**
   * Whether an empty browsed list means the reader's filters matched nothing (the default), rather than a catalogue with nothing in it yet.
   * False hands the empty list to `renderTiles`, whose own empty words then speak.
   */
  filtered?: boolean;
  /** The sentence under "Nothing matches", when filters as well as words narrow the list; by default "No ruleset matches this search." */
  noMatchesSentence?: string;
  /** The way on from a search or filter that matched nothing, such as a reset; a `LabeledAction`. */
  noMatchesAction?: ReactNode;
  /** A longer list has been asked for and has not arrived. */
  loading: boolean;
  /** The longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
  /** The searched list, so the route can move focus to the first new entry when it grows. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * A catalogue's results in the two ways a reader reaches them: one browsed page with its pager, or a search's best matches with "Load more".
 * And the two ways they come back empty: nothing matched, or the page number is past the end.
 *
 * The route keeps everything that is its own: the query, the search schema, the address of a page, and the tiles.
 * This owns the arrangement around them, worded once, so the five catalogues stop drifting apart in their empty states and their search endings.
 */
export function CatalogueResults<Entry>(props: CatalogueResultsProps<Entry>) {
  return props.results.kind === 'browse' ? (
    <BrowsedList {...props} results={props.results} />
  ) : (
    <SearchedList {...props} results={props.results} />
  );
}

/** "Nothing matches" in its pane, with the caller's sentence and way on. */
function NoMatches({
  singular,
  noMatchesSentence,
  noMatchesAction,
  capped,
}: Pick<CatalogueResultsProps<unknown>, 'singular' | 'noMatchesSentence' | 'noMatchesAction'> & { capped: boolean }) {
  return (
    <Surface padding="xl">
      <EmptyResults title="Nothing matches" capped={capped} action={noMatchesAction}>
        {noMatchesSentence ?? `No ${singular} matches this search.`}
      </EmptyResults>
    </Surface>
  );
}

/** One browsed page and its pager, or why the page is empty. */
function BrowsedList<Entry>({
  results,
  noun,
  pagerLabel,
  pageLinkProps,
  renderTiles,
  filtered = true,
  ...rest
}: CatalogueResultsProps<Entry> & { results: BrowsedResults<Entry> }) {
  if (results.total === 0 && filtered) {
    return <NoMatches {...rest} capped={!results.complete} />;
  }
  if (results.total > 0 && results.entries.length === 0) {
    return (
      <Surface padding="xl">
        <PastTheEnd pageCount={results.pageCount} noun={noun} pageLinkProps={pageLinkProps} />
      </Surface>
    );
  }
  return (
    <Stack gap="lg">
      {renderTiles(results.entries)}
      {results.total > 0 ? (
        <CataloguePager
          page={results.page}
          pageCount={results.pageCount}
          pageSize={results.pageSize}
          total={results.total}
          complete={results.complete}
          noun={noun}
          label={pagerLabel}
          pageLinkProps={pageLinkProps}
        />
      ) : null}
    </Stack>
  );
}

/** A search's best matches, grown by "Load more", or "Nothing matches". */
function SearchedList<Entry>({
  results,
  noun,
  renderTiles,
  loading,
  loaded,
  onLoadMore,
  ref,
  ...rest
}: CatalogueResultsProps<Entry> & { results: SearchedResults<Entry> }) {
  if (results.entries.length === 0) {
    return <NoMatches {...rest} capped={results.capped} />;
  }
  return (
    <Stack gap="lg" aria-busy={loading} ref={ref}>
      {renderTiles(results.entries)}
      {/* The entries say how many arrived; this says only that they did, so a reader hears the list grow without a count the page never shows. */}
      <VisuallyHidden role="status" aria-live="polite">
        {loaded ? `More ${noun} loaded` : null}
      </VisuallyHidden>
      {results.hasMore ? <LoadMoreButton loading={loading} onLoadMore={onLoadMore} /> : null}
      {results.capped ? (
        <Text c="dimmed" ta="center">
          That's as far as this search goes. Add a word to narrow it.
        </Text>
      ) : null}
    </Stack>
  );
}
