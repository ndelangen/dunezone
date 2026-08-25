/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { expect, test, vi } from 'vitest';

import { api } from '../../../../convex/_generated/api';
import { ConvexStorybookWorkerContext, useConvexStorybookQuery } from './runtime';
import type { ConvexStorybookWorkerClient } from './runtime';

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('a revision refresh preserves the current query value until its replacement arrives', async () => {
  const initial = [{ name: 'Initial ruleset' }];
  const replacement = [{ name: 'Replacement ruleset' }];
  const firstQuery = deferred<unknown>();
  const refreshedQuery = deferred<unknown>();
  const listeners = new Set<() => void>();
  let revision = 0;
  const query = vi.fn().mockReturnValueOnce(firstQuery.promise).mockReturnValueOnce(refreshedQuery.promise);
  const client = {
    getRevision: () => revision,
    query,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ConvexStorybookWorkerClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ConvexStorybookWorkerContext.Provider value={{ client }}>{children}</ConvexStorybookWorkerContext.Provider>
  );
  const hook = renderHook(() => useConvexStorybookQuery(api.rulesets.list, {}), { wrapper });

  firstQuery.resolve(initial);
  await waitFor(() => expect(hook.result.current).toBe(initial));

  act(() => {
    revision += 1;
    for (const listener of listeners) {
      listener();
    }
  });
  expect(hook.result.current).toBe(initial);

  refreshedQuery.resolve(replacement);
  await waitFor(() => expect(hook.result.current).toBe(replacement));
  expect(query).toHaveBeenCalledTimes(2);
});
