import assert from 'node:assert/strict';

import type { ConvexHttpClient } from 'convex/browser';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';

/** Convex exposes this method at runtime but omits its internal declaration from the published types. */
export function setAdminAuth(client: ConvexHttpClient, token: string): void {
  assert.ok('setAdminAuth' in client && typeof client.setAdminAuth === 'function');
  const method: unknown = client.setAdminAuth;
  assert.ok(typeof method === 'function');
  Reflect.apply(method, client, [token]);
}

/** Keeps the generated argument and return types while the HTTP client calls an internal mutation with admin auth. */
export function adminMutationReference<A extends Record<string, unknown>, R>(
  reference: FunctionReference<'mutation', 'internal', A, R>
): FunctionReference<'mutation', 'public', A, R> {
  return makeFunctionReference<'mutation', A, R>(getFunctionName(reference));
}

/** Bun adds fetch.preconnect to its declaration; preserve it when replacing fetch for a bounded request. */
export function signalFetch(signal: () => AbortSignal): typeof fetch {
  return Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      fetch(input, { ...init, signal: signal() }),
    fetch
  );
}
