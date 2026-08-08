import { ConvexHttpClient } from 'convex/browser';
import { ConvexReactClient } from 'convex/react';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

const convexUrl = import.meta.env.VITE_CONVEX_URL!;
export const convex = new ConvexReactClient(convexUrl);

/** TanStack Start sets this while generating static HTML; no user session or reliable backend. */
function isTanStackStartPrerendering(): boolean {
  return typeof process !== 'undefined' && process.env?.TSS_PRERENDERING === 'true';
}

let prerenderHttpClient: ConvexHttpClient | null = null;

function convexBackendForDb(): ConvexReactClient | ConvexHttpClient {
  if (isTanStackStartPrerendering()) {
    if (!prerenderHttpClient) {
      prerenderHttpClient = new ConvexHttpClient(convexUrl, { logger: false });
    }
    return prerenderHttpClient;
  }
  return convex;
}

export const db = {
  query: async <Query extends FunctionReference<'query'>>(
    fn: Query,
    args: FunctionArgs<Query>
  ): Promise<FunctionReturnType<Query>> => {
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
