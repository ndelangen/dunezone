import { Stack, Text, Title } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';

import { LabeledAction } from '../control/LabeledAction';

export interface EmptyResultsProps {
  /** What the reader finds, as a heading: "Nothing matches". */
  title: string;
  /** Why, in one sentence. */
  children: string;
  /** True when a search stopped before it checked everything, so another word may still find something. */
  capped?: boolean;
  /** The way on, as a `LabeledAction`: back to the last page, or a reset. */
  action?: ReactNode;
}

/** The one sentence a capped search adds, worded once for every catalogue. */
const CAPPED = 'Only the first matches of this search were checked. Add a word to narrow it.';

/**
 * Says that a list of results came back empty, and offers the way on.
 *
 * Two readers end up here and they share one arrangement: a search that matched nothing, and a page number past the end of the list.
 * The words are the caller's;
 * `PastTheEnd` below is the second case already worded, since every catalogue says it the same way.
 * It paints no pane: inside a `PageMessage` the message brings its own, and a results list puts one `Surface` around it.
 *
 * It exists because five catalogues each wrote both of these by hand, under four titles, and one of them wrapped its pane in a second.
 */
export function EmptyResults({ title, children, capped = false, action }: EmptyResultsProps) {
  return (
    <Stack gap="xs" align="center">
      <Title order={2}>{title}</Title>
      <Text c="dimmed" ta="center">
        {children}
      </Text>
      {capped ? (
        <Text size="xs" c="dimmed" ta="center">
          {CAPPED}
        </Text>
      ) : null}
      {action ? <Stack mt="xs">{action}</Stack> : null}
    </Stack>
  );
}

export interface PastTheEndProps {
  /** How many pages the list has now. */
  pageCount: number;
  /** What the pages hold, plural and lower case, as `CataloguePager` takes it: "factions". */
  noun: string;
  /** The props that make a link to one page, as `CataloguePager` takes them: `{ component: Link, to, search }`. */
  pageLinkProps: (page: number) => Record<string, unknown>;
}

/** A page past the end, from an old link or a list that shrank: where the list ends, and a link there. */
export function PastTheEnd({ pageCount, noun, pageLinkProps }: PastTheEndProps) {
  const { component, ...linkProps } = pageLinkProps(pageCount);
  const Root = (component ?? 'a') as ElementType;
  return (
    <EmptyResults
      title="Nothing on this page"
      action={
        <LabeledAction icon={<ArrowLeft size={16} />} renderRoot={(props) => <Root {...props} {...linkProps} />}>
          {pageCount === 1 ? `Go to the ${noun}` : `Go to page ${pageCount}`}
        </LabeledAction>
      }
    >
      {pageCount === 1 ? `The ${noun} fit on one page.` : `The ${noun} end on page ${pageCount}.`}
    </EmptyResults>
  );
}
