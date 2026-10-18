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
export const convex: ConvexReactClient = new HoldingConvexClient(convexUrl);

/** Server reads never share the browser's authenticated client or open a WebSocket. */
function convexBackendForDb(): ConvexReactClient | ConvexHttpClient {
  if (!import.meta.env.SSR) {
    return convex;
  }
  return new ConvexHttpClient(convexUrl, {
    logger: false,
  });
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
