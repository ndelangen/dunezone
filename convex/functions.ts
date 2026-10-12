/* oxlint-disable no-restricted-imports -- This is the sole raw function-builder boundary. */
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';

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

/** Where Convex keeps a component reference's address; `convex/server` sets it and reads it by this registered symbol. */
const REFERENCE_PATH = Symbol.for('toReferencePath');

/**
 * The component address a reference names, read once, or null when it is not positively a component's function.
 * Anything else is refused: an app function by name, and a function handle, which is a string that can name an app function as easily as a component's.
 */
function componentPath(reference: Parameters<QueryCtx['runQuery']>[0]): string | null {
  if (typeof reference !== 'object' || reference === null) {
    return null;
  }
  const path: unknown = (reference as unknown as Record<symbol, unknown>)[REFERENCE_PATH];
  return typeof path === 'string' && path.startsWith('_reference/childComponent/') ? path : null;
}

/**
 * A nested app query runs with the caller's identity, so it would carry the viewer past the `auth` stub.
 * Components, such as the aggregates, run without the app's identity and stay callable;
 * everything else is refused.
 * The call goes out on a fresh reference holding only the checked path, so an object that also names an app function, or answers differently when read twice, cannot reach one.
 */
function viewerIndependentRunQuery(runQuery: QueryCtx['runQuery']): QueryCtx['runQuery'] {
  return (reference, ...args) => {
    const path = componentPath(reference);
    if (path === null) {
      throw new Error(
        `${VIEWER_INDEPENDENCE} Nested ctx.runQuery is refused for the same reason, except into a component.`
      );
    }
    /* No prototype, so not even a `functionName` symbol planted on Object.prototype can name an app function. */
    const forwarded = Object.assign(Object.create(null) as object, { [REFERENCE_PATH]: path });
    return runQuery(forwarded as unknown as typeof reference, ...args);
  };
}

/**
 * The default query builder: the same answer for every caller, so Convex caches one result for all of them and the page can be prebuilt.
 * `ctx.auth`, and `ctx.runQuery` into anything but a component, throw, which makes reading the viewer, directly, through any helper or through a nested query, fail loudly instead of quietly making the result per-user.
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
