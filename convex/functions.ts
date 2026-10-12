/* oxlint-disable no-restricted-imports -- This is the sole raw function-builder boundary. */
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';
import { getFunctionName } from 'convex/server';

import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
  query as rawQuery,
} from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { applicationTriggers } from './lib/applicationTriggers';
import { requireAdminUserId } from './lib/policy';

export const mutation = customMutation(rawMutation, customCtx(applicationTriggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(applicationTriggers.wrapDB));

/**
 * Which builder a client-callable query was made with.
 * `convex/queryAudience.architecture.test.ts` reads it to hold every query to its declared audience.
 */
export const QUERY_AUDIENCE = Symbol.for('dunezone.queryAudience');
export type QueryAudience = 'public' | 'viewer' | 'admin';

function withAudience<Builder extends (...args: never[]) => unknown>(
  audience: QueryAudience,
  builder: Builder
): Builder {
  return ((...args: Parameters<Builder>) => {
    const registered = builder(...args) as object;
    Object.defineProperty(registered, QUERY_AUDIENCE, { value: audience });
    return registered;
  }) as Builder;
}

const VIEWER_INDEPENDENCE =
  'A publicQuery cannot read the viewer: its result is cached and shared across every user. ' +
  'Return the facts the browser needs and combine them with the viewer client-side, or use viewerQuery.';

const viewerIndependentAuth = {
  getUserIdentity: () => {
    throw new Error(VIEWER_INDEPENDENCE);
  },
};

/** Whether a reference names one of this app's own functions, rather than a component's. */
function isAppFunction(reference: Parameters<QueryCtx['runQuery']>[0]) {
  try {
    getFunctionName(reference);
    return true;
  } catch {
    return false;
  }
}

/**
 * A nested app query runs with the caller's identity, so it would carry the viewer past the `auth` stub.
 * Components, such as the aggregates, run without the app's identity and stay callable.
 */
function viewerIndependentRunQuery(runQuery: QueryCtx['runQuery']): QueryCtx['runQuery'] {
  return (reference, ...args) => {
    if (isAppFunction(reference)) {
      throw new Error(`${VIEWER_INDEPENDENCE} Nested ctx.runQuery into this app is refused for the same reason.`);
    }
    return runQuery(reference, ...args);
  };
}

/**
 * The default query builder: the same answer for every caller, so Convex caches one result for all of them and the page can be prebuilt.
 * `ctx.auth`, and `ctx.runQuery` into this app's own functions, throw, which makes reading the viewer, directly, through any helper or through a nested query, fail loudly instead of quietly making the result per-user.
 */
export const publicQuery = withAudience(
  'public',
  customQuery(
    rawQuery,
    customCtx((ctx) => ({ auth: viewerIndependentAuth, runQuery: viewerIndependentRunQuery(ctx.runQuery) }))
  )
);

/**
 * A query whose answer depends on who asks: settings, drafts, seats, the viewer's own memberships.
 * Each one is listed, with its reason, in `convex/queryAudience.architecture.test.ts`.
 */
export const viewerQuery = withAudience('viewer', rawQuery);

/** A query only admins may run. The builder performs the check, so a handler cannot forget it. */
export const adminQuery = withAudience(
  'admin',
  customQuery(
    rawQuery,
    customCtx(async (ctx) => ({ adminUserId: await requireAdminUserId(ctx) }))
  )
);
