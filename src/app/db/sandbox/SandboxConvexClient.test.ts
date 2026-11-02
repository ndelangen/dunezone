import { makeFunctionReference } from 'convex/server';
import { describe, expect, test, vi } from 'vite-plus/test';

import type { ConvexStorybookWorkerClient } from '../storybook/runtime';
import { SandboxConvexClient } from './SandboxConvexClient';

const count = makeFunctionReference<'query', { kind: string }>('factions:count');
const add = makeFunctionReference<'mutation', { kind: string }>('factions:add');

/* A backend whose rows are one counter per kind, so a test can see a write reach a watched read. */
function fakeBackend() {
  const rows = new Map<string, number>();
  const listeners = new Set<() => void>();
  const identities: unknown[] = [];
  const backend = {
    query: vi.fn(async (_fn: unknown, args: { kind: string }, identity: unknown) => {
      identities.push(identity);
      if (args.kind === 'broken') {
        throw new Error('refused');
      }
      return rows.get(args.kind) ?? 0;
    }),
    mutation: vi.fn(async (_fn: unknown, args: { kind: string }, identity: unknown) => {
      identities.push(identity);
      rows.set(args.kind, (rows.get(args.kind) ?? 0) + 1);
      listeners.forEach((listener) => listener());
      return null;
    }),
    action: vi.fn(async () => null),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { backend: backend as unknown as ConvexStorybookWorkerClient, calls: backend, identities };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const viewer = { subjectKey: 'learner' };

describe('the sandbox Convex client', () => {
  test('a watched query answers from the backend and answers again after a write', async () => {
    const { backend } = fakeBackend();
    const client = new SandboxConvexClient(backend, viewer);
    const watch = client.watchQuery(count, { kind: 'faction' });
    const updates = vi.fn();
    watch.onUpdate(updates);
    expect(watch.localQueryResult()).toBeUndefined();
    await settle();
    expect(watch.localQueryResult()).toBe(0);
    await client.mutation(add, { kind: 'faction' });
    await settle();
    expect(watch.localQueryResult()).toBe(1);
    expect(updates).toHaveBeenCalledTimes(2);
  });

  test('a failed query throws its error to the reader, as a deployment would', async () => {
    const { backend } = fakeBackend();
    const client = new SandboxConvexClient(backend, viewer);
    const watch = client.watchQuery(count, { kind: 'broken' });
    watch.onUpdate(() => undefined);
    await settle();
    expect(() => watch.localQueryResult()).toThrow('refused');
  });

  test('every call goes as the sandbox viewer, whatever token Convex Auth holds', async () => {
    const { backend, identities } = fakeBackend();
    const client = new SandboxConvexClient(backend, viewer);
    const changed = vi.fn();
    client.setAuth(async () => 'a real token', changed);
    await client.query(count, { kind: 'faction' });
    await client.mutation(add, { kind: 'faction' });
    await settle();
    expect(changed).toHaveBeenCalledWith(true);
    expect(identities).toEqual([viewer, viewer]);
  });

  test('a fresh backend answers every watched query again', async () => {
    const first = fakeBackend();
    const client = new SandboxConvexClient(first.backend, viewer);
    const watch = client.watchQuery(count, { kind: 'faction' });
    watch.onUpdate(() => undefined);
    await client.mutation(add, { kind: 'faction' });
    await settle();
    expect(watch.localQueryResult()).toBe(1);
    const second = fakeBackend();
    client.replaceBackend(second.backend);
    await settle();
    expect(watch.localQueryResult()).toBe(0);
  });
});
