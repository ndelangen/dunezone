import { ConvexHttpClient } from 'convex/browser';
import { ConvexReactClient } from 'convex/react';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

const convexUrl = import.meta.env.VITE_CONVEX_URL!;
export const convex = new ConvexReactClient(convexUrl);

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
  query: async <Query extends FunctionReference<'query'>>(
    fn: Query,
    args: FunctionArgs<Query>
  ): Promise<FunctionReturnType<Query>> => {
    if (import.meta.env.SSR) {
      const { getResponseHeader, setResponseHeader } = await import('@tanstack/react-start/server');
      const queries = Number(getResponseHeader('X-Public-Metadata-Queries') ?? 0);
      setResponseHeader('X-Public-Metadata-Queries', String(queries + 1));
    }
    const backend = convexBackendForDb();
    return await backend.query(fn, args as never);
  },
  mutation: async <Mutation extends FunctionReference<'mutation'>>(
    fn: Mutation,
    args: FunctionArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> => {
    const backend = convexBackendForDb();
    return await backend.mutation(fn, args as never);
  },
};
