import { Stack, Text, VisuallyHidden } from '@mantine/core';
import { EmptyResults, PastTheEnd } from '@ui/block/EmptyResults';
import { CataloguePager } from '@ui/control/CataloguePager';
import type { PageLinkProps } from '@ui/control/CataloguePager';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { Surface } from '@ui/surface';
import type { ReactNode, Ref } from 'react';

/** One browsed page of a catalogue, as its query answers it, and the way to the other pages. */
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
  /** Names the page list for assistive technology: "Ruleset pages". */
  pagerLabel: string;
  /** The props that make a link to one page; the route decides where a page lives. */
  pageLinkProps: (page: number) => PageLinkProps;
}

/** The best matches of a search, and the way to a longer list. */
interface SearchedResults<Entry> {
  kind: 'search';
  entries: Entry[];
  /** Whether a longer list is there to ask for. */
  hasMore: boolean;
  /** True when the search stopped before it checked everything. */
  capped: boolean;
  /** A longer list has been asked for and has not arrived. */
  loading: boolean;
  /** The longer list asked for has arrived. */
  loaded: boolean;
  onLoadMore: () => void;
}

export interface CatalogueResultsProps<Entry> {
  results: BrowsedResults<Entry> | SearchedResults<Entry>;
  /** What the results are, plural and lower case: "rulesets", "treachery cards". */
  noun: string;
  /** The sentence under "Nothing matches": "No ruleset matches this search." */
  noMatches: string;
  /** The way on from a search or filter that matched nothing, such as a reset; a `LabeledAction`. */
  noMatchesAction?: ReactNode;
  /** The results themselves: the route's own tiles, rows or cards. */
  renderEntries: (entries: Entry[]) => ReactNode;
  /** The searched list, so the route can move focus to the first new entry when it grows. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * A catalogue's results in the two ways a reader reaches them: one browsed page with its pager, or a search's best matches with "Load more".
 * And the two ways they come back empty: nothing matched, or the page number is past the end.
 *
 * The route keeps everything that is its own: the query, the search schema, the address of a page, and the entries.
 * A catalogue with nothing in it yet is the route's to say before it gets here, since only it knows its own words for that;
 * here an empty list always means the reader's search or filters matched nothing.
 * This owns the arrangement around the entries, worded once, so the catalogues stop drifting apart in their empty states and their search endings.
 */
export function CatalogueResults<Entry>({
  results,
  noun,
  noMatches,
  noMatchesAction,
  renderEntries,
  ref,
}: CatalogueResultsProps<Entry>) {
  const capped = results.kind === 'search' ? results.capped : !results.complete;
  if (results.kind === 'browse' ? results.total === 0 : results.entries.length === 0) {
    return (
      <Surface padding="xl">
        <EmptyResults title="Nothing matches" capped={capped} action={noMatchesAction}>
          {noMatches}
        </EmptyResults>
      </Surface>
    );
  }
  return results.kind === 'browse' ? (
    <BrowsedList results={results} noun={noun} renderEntries={renderEntries} />
  ) : (
    <SearchedList results={results} noun={noun} renderEntries={renderEntries} ref={ref} />
  );
}

/** One browsed page and its pager, or where the pages end. */
function BrowsedList<Entry>({
  results,
  noun,
  renderEntries,
}: Pick<CatalogueResultsProps<Entry>, 'noun' | 'renderEntries'> & { results: BrowsedResults<Entry> }) {
  if (results.entries.length === 0) {
    return (
      <Surface padding="xl">
        <PastTheEnd pageCount={results.pageCount} noun={noun} pageLinkProps={results.pageLinkProps} />
      </Surface>
    );
  }
  return (
    <Stack gap="lg">
      {renderEntries(results.entries)}
      <CataloguePager
        page={results.page}
        pageCount={results.pageCount}
        pageSize={results.pageSize}
        total={results.total}
        complete={results.complete}
        noun={noun}
        label={results.pagerLabel}
        pageLinkProps={results.pageLinkProps}
      />
    </Stack>
  );
}

/** A search's best matches, grown by "Load more". */
function SearchedList<Entry>({
  results,
  noun,
  renderEntries,
  ref,
}: Pick<CatalogueResultsProps<Entry>, 'noun' | 'renderEntries' | 'ref'> & { results: SearchedResults<Entry> }) {
  return (
    <Stack gap="lg" aria-busy={results.loading} ref={ref}>
      {renderEntries(results.entries)}
      {/* The entries say how many arrived; this says only that they did, so a reader hears the list grow without a count the page never shows. */}
      <VisuallyHidden role="status" aria-live="polite">
        {results.loaded ? `More ${noun} loaded` : null}
      </VisuallyHidden>
      {results.hasMore ? <LoadMoreButton loading={results.loading} onLoadMore={results.onLoadMore} /> : null}
      {results.capped ? (
        <Text c="dimmed" ta="center">
          That's as far as this search goes. Add a word to narrow it.
        </Text>
      ) : null}
    </Stack>
  );
}
