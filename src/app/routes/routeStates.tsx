import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { errorMessage } from '@ui/content/errorMessage';
import type { PageHeaderSize } from '@ui/layout/PageLayout';
import type { ReactNode } from 'react';

import { isStaleClientData } from '@app/db/core/clientBoundary';
import { NotFoundState } from '@app/widgets/page-message/NotFoundState';
import type { NotFoundStateProps } from '@app/widgets/page-message/NotFoundState';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { useLivePageTitle } from './publicPage';

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

/*
 * Route glue rather than a widget: these read the loader's error (whether the client is stale) and the tab title, which a widget may not.
 * The words for a missing thing are the widget's `NotFoundState`, which a page that draws its own frame uses directly.
 */

/**
 * A route's `errorComponent` when all it has to say is that its data did not load.
 *
 * Reads the stale-deploy flag and the message off the error itself, so a route only names its page and what failed.
 * Routes that branch first (not found, not yours) hand this the generic branch;
 * `detailError` builds both for a detail page.
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

const capitalised = (noun: string) => `${noun[0]?.toUpperCase() ?? ''}${noun.slice(1)}`;

export interface RouteNotFoundProps extends RouteStateFrame, NotFoundStateProps {}

/**
 * A page whose subject is not there: the page frame, the one not-found wording, and the tab title saying so.
 * Seventeen pages spelled this by hand in four wordings;
 * the noun is all that differs.
 */
export function RouteNotFound({ title, size, back, noun, renamed }: RouteNotFoundProps) {
  useLivePageTitle(`${capitalised(noun)} not found`);
  return (
    <PageMessage size={size} title={title} back={back}>
      <NotFoundState noun={noun} renamed={renamed} />
    </PageMessage>
  );
}

export interface DetailErrorOptions {
  /** What the page shows, lower case: "faction". The frame is titled with it, and the messages name it. */
  noun: string;
  /** Whether the loader's error means the subject is not there, rather than that the read failed. */
  isMissing: (error: unknown) => boolean;
  /** The way back out, as a `PageMessage.Back`. */
  back: ReactNode;
  renamed?: boolean;
}

/** A detail page's `errorComponent`: not found when the subject is missing, the load error otherwise. */
export function detailError({ noun, isMissing, back, renamed }: DetailErrorOptions) {
  const title = capitalised(noun);
  return function DetailError({ error }: ErrorComponentProps) {
    return isMissing(error) ? (
      <RouteNotFound size="compact" title={title} back={back} noun={noun} renamed={renamed} />
    ) : (
      <RouteLoadError size="compact" title={title} back={back} what={`${title} could not be loaded`} error={error} />
    );
  };
}
