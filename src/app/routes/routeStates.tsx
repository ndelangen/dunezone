import { LoadError } from '@ui/block/LoadError';
import { errorMessage } from '@ui/content/errorMessage';
import type { PageHeaderSize } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

interface RouteStateFrame {
  /** The page's own name, as `PageMessage` takes it. */
  title: string;
  /** The band the loaded page would have had. */
  size?: PageHeaderSize;
  /** The way back out, as a `PageMessage.Back`. */
  back?: ReactNode;
}

export interface RouteLoadErrorProps extends RouteStateFrame {
  /** What failed, as the error's heading: "Faction could not be loaded". */
  what: string;
  /** The error the route's loader threw, straight from `ErrorComponentProps`. */
  error: unknown;
}

/**
 * A route's `errorComponent` when all it has to say is that its data did not load.
 *
 * Reads the stale-deploy flag and the message off the error itself, so a route only names its page and what failed.
 * Routes that branch first (not found, not yours) keep their own function and hand this the generic branch.
 */
export function RouteLoadError({ title, size, back, what, error }: RouteLoadErrorProps) {
  return (
    <PageMessage size={size} title={title} back={back}>
      <LoadError title={what} stale={isStaleClientData(error)}>
        {errorMessage(error)}
      </LoadError>
    </PageMessage>
  );
}
