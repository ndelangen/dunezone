/* oxlint-disable no-restricted-imports -- This is the sole raw function-builder boundary. */
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';

import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
  query as rawQuery,
} from './_generated/server';
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

const viewerIndependentAuth = {
  getUserIdentity: () => {
    throw new Error(
      'A publicQuery cannot read the viewer: its result is cached and shared across every user. ' +
        'Return the facts the browser needs and combine them with the viewer client-side, or use viewerQuery.'
    );
  },
};

/**
 * The default query builder: the same answer for every caller, so Convex caches one result for all of them and the page can be prebuilt.
 * `ctx.auth` throws, which makes reading the viewer, directly or through any helper, fail loudly instead of quietly making the result per-user.
 */
export const publicQuery = withAudience(
  'public',
  customQuery(
    rawQuery,
    customCtx(() => ({ auth: viewerIndependentAuth }))
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
