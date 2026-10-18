import { Pagination, Stack, Text } from '@mantine/core';

export type CataloguePagerProps = {
  /** The page shown, from 1. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** Matches across every page. */
  total: number;
  /** False when a search matched more than one read can hold, so `total` is a floor. */
  complete: boolean;
  /** What the pages hold, plural and lower case: "factions", "treachery cards". */
  noun: string;
  /** Names the page list for assistive technology. */
  label: string;
  /** The props that make one page's control a link to it, such as `{ component: Link, to, search }`; the caller decides where a page lives. */
  pageLinkProps: (page: number) => Record<string, unknown>;
};

/**
 * Where the reader is in the results, and real links to the other pages, so a page can be opened, shared and crawled.
 * Nothing to page through on a single page, though an incomplete search still says so.
 * A search that stopped short pages only the matches it read, and the count says so rather than naming a total nobody counted.
 */
export function CataloguePager({
  page,
  pageCount,
  pageSize,
  total,
  complete,
  noun,
  label,
  pageLinkProps,
}: CataloguePagerProps) {
  if (pageCount <= 1) {
    return complete ? null : <IncompleteNotice noun={noun} />;
  }
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  /* Clamped, so an edge control at the end of the range links to the page already shown rather than past it. */
  const clamp = (target: number) => Math.min(Math.max(target, 1), pageCount);
  const target = { first: 1, previous: clamp(page - 1), next: clamp(page + 1), last: pageCount };
  const controlLabel = { first: 'First page', previous: 'Previous page', next: 'Next page', last: 'Last page' };
  return (
    <Stack gap="xs" align="center">
      <Pagination
        value={page}
        total={pageCount}
        withEdges
        aria-label={label}
        getItemProps={(item) => pageLinkProps(item)}
        getControlProps={(control) => ({ ...pageLinkProps(target[control]), 'aria-label': controlLabel[control] })}
      />
      <Text size="xs" c="dimmed">
        {complete ? `${first}–${last} of ${total} ${noun}` : `${first}–${last} of the first ${total} matching ${noun}`}
      </Text>
      {complete ? null : <IncompleteNotice noun={noun} />}
    </Stack>
  );
}

/** A search reads a capped number of matches, so its results can stop short of everything that matches. */
function IncompleteNotice({ noun }: { noun: string }) {
  return (
    <Text size="xs" c="dimmed" ta="center">
      {`This search matched more ${noun} than can be checked at once. Add a word to narrow it.`}
    </Text>
  );
}

/** A count drawn from a capped read is a floor, and reads as one. */
export function catalogueCountLabel(count: number, complete: boolean) {
  return complete ? String(count) : `${count}+`;
}
