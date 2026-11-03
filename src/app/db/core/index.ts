import { readingRenamedEmblems, readRenamedEmblems } from '@shared/renamedEmblem';
import { ConvexHttpClient } from 'convex/browser';
import { ConvexReactClient } from 'convex/react';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import { keepWarm, LOADER_HOLD_MS, releaseAllHolds } from './warm';

/* Sign-in and sign-out drop every held query first, so a loader never reuses a private result held for the identity before. */
class HoldingConvexClient extends ConvexReactClient {
  override setAuth(...args: Parameters<ConvexReactClient['setAuth']>) {
    releaseAllHolds();
    super.setAuth(...args);
  }

  override clearAuth() {
    releaseAllHolds();
    super.clearAuth();
  }
}

const convexUrl = import.meta.env.VITE_CONVEX_URL!;
/*
 * Every hook and one-shot read answers under this release's names, ahead of the emblem rename (see `readRenamedEmblems`).
 * Hooks read through `watchQuery`, whose current answer is rewritten on each read and kept stable per answer.
 */
function readingRenamedWatches(client: ConvexReactClient): ConvexReactClient {
  /* Storybook stands a client in that has no live queries. */
  if (typeof client.watchQuery !== 'function') {
    return readingRenamedEmblems(client, ['query', 'mutation', 'action']);
  }
  const watchQuery = client.watchQuery.bind(client);
  const watch = watchQuery as unknown as (...args: never[]) => ReturnType<typeof watchQuery>;
  client.watchQuery = ((...args: never[]) => {
    const watched = watch(...args);
    return { ...watched, localQueryResult: () => readRenamedEmblems(watched.localQueryResult()) };
  }) as unknown as typeof client.watchQuery;
  return readingRenamedEmblems(client, ['query', 'mutation', 'action']);
}

export const convex: ConvexReactClient = readingRenamedWatches(new HoldingConvexClient(convexUrl));

/*
 * A sandbox, such as a creator tutorial's in-memory database, answers in place of the deployment while it is open,
 * so the loaders of the pages it shows read and write its rows, never the deployment's.
 */
type SandboxBackend = Pick<ConvexReactClient, 'query' | 'mutation' | 'action'>;
let sandbox: SandboxBackend | null = null;

/** Sends `db` to `backend` until the returned function is called. */
export function enterSandbox(backend: SandboxBackend): () => void {
  sandbox = backend;
  return () => {
    if (sandbox === backend) {
      sandbox = null;
    }
  };
}

/** Server reads never share the browser's authenticated client or open a WebSocket. */
function convexBackendForDb(): SandboxBackend | ConvexHttpClient {
  if (sandbox) {
    return sandbox;
  }
  if (!import.meta.env.SSR) {
    return convex;
  }
  return readingRenamedEmblems(new ConvexHttpClient(convexUrl, { logger: false }), [
    'query',
    'consistentQuery',
    'mutation',
    'action',
  ]);
}

export const db = {
  action: async <Action extends FunctionReference<'action'>>(
    fn: Action,
    args: FunctionArgs<Action>
  ): Promise<FunctionReturnType<Action>> => {
    return await convexBackendForDb().action(fn, args as never);
  },
  /** `hold: false` skips the browser-side hold, for arguments that change as someone types. */
  query: async <Query extends FunctionReference<'query'>>(
    fn: Query,
    args: FunctionArgs<Query>,
    options?: { hold?: boolean }
  ): Promise<FunctionReturnType<Query>> => {
    if (sandbox) {
      return await sandbox.query(fn, args as never);
    }
    if (import.meta.env.SSR) {
      const { getResponseHeader, setResponseHeader } = await import('@tanstack/react-start/server');
      const queries = Number(getResponseHeader('X-Public-Metadata-Queries') ?? 0);
      setResponseHeader('X-Public-Metadata-Queries', String(queries + 1));
    }
    /* The hold goes in before the read, so the read answers from it rather than opening and dropping a subscription of its own. */
    if (!import.meta.env.SSR && (options?.hold ?? true)) {
      keepWarm(convex, fn, args, LOADER_HOLD_MS);
    }
    return await convexBackendForDb().query(fn, args as never);
  },
  mutation: async <Mutation extends FunctionReference<'mutation'>>(
    fn: Mutation,
    args: FunctionArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> => {
    const backend = convexBackendForDb();
    return await backend.mutation(fn, args as never);
  },
};
