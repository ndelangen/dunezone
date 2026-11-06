import { LoadPending } from '@ui/block/LoadPending';
import type { PageHeaderSize } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import { PageMessage } from './PageMessage';

export interface RoutePendingProps {
  /** The page's own name, as `PageMessage` takes it. */
  title: string;
  /** The band the loaded page would have had. */
  size?: PageHeaderSize;
  /** The way back out, as a `PageMessage.Back`. */
  back?: ReactNode;
  /** What is loading, as the pending heading: "Loading faction". */
  loading: string;
  /** One sentence on what the reader is waiting for. */
  children: string;
}

/** A page still waiting for its data: the page frame with a `LoadPending` inside, for a route's `pendingComponent` and for a page whose query has not answered yet. */
export function RoutePending({ title, size, back, loading, children }: RoutePendingProps) {
  return (
    <PageMessage size={size} title={title} back={back}>
      <LoadPending title={loading}>{children}</LoadPending>
    </PageMessage>
  );
}
