/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { WorkerRequest, WorkerResponse } from './protocol';
import { loadStorybookDatabase, StorybookDatabaseProvider } from './StorybookDatabaseProvider';

vi.mock('../core', () => ({ db: { query: vi.fn(), mutation: vi.fn(), action: vi.fn() } }));
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useQueries: vi.fn(),
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

const workers: ControlledWorker[] = [];
class ControlledWorker extends EventTarget {
  requests: WorkerRequest[] = [];
  terminate = vi.fn();

  constructor() {
    super();
    workers.push(this);
  }

  postMessage(request: WorkerRequest) {
    this.requests.push(request);
  }

  reply(operation: WorkerRequest['operation'], result: unknown) {
    const request = this.requests.find((entry) => entry.operation === operation);
    if (!request) {
      throw new Error(`No pending ${operation} request`);
    }
    this.dispatchEvent(
      new MessageEvent('message', { data: { id: request.id, ok: true, result } satisfies WorkerResponse })
    );
  }
}

const clients: { terminate(): void }[] = [];
beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal('Worker', ControlledWorker);
});
afterEach(async () => {
  cleanup();
  for (const client of clients.splice(0)) {
    client.terminate();
  }
  await Promise.resolve();
  vi.unstubAllGlobals();
});

function setup(path: unknown = '/') {
  const controller = new AbortController();
  const pending = loadStorybookDatabase({
    parameters: { database: { create: () => [] } },
    args: { path },
    abortSignal: controller.signal,
  });
  return { controller, pending, worker: workers[0]! };
}

test('a seeded page cannot render until its database and generated address are ready', async () => {
  const reference = { $seedRef: 'game', $seedText: '/play/__seed_ref__' };
  const { pending, worker } = setup(reference);
  let ready = false;
  void pending.then(() => {
    ready = true;
  });
  expect(ready).toBe(false);
  worker.reply('reset', null);
  await waitFor(() => expect(worker.requests.map(({ operation }) => operation)).toEqual(['reset', 'resolve']));
  expect(ready).toBe(false);
  worker.reply('resolve', '/play/seeded-game');
  const { storybookDatabase: prepared } = await pending;
  expect(prepared).toBeDefined();
  expect(await prepared!.client.resolve(reference)).toBe('/play/seeded-game');
  clients.push(prepared!.client);
  render(
    <StorybookDatabaseProvider prepared={prepared!}>
      <p>The page interaction can start</p>
    </StorybookDatabaseProvider>
  );
  expect(screen.getByText('The page interaction can start')).toBeTruthy();
  expect(worker.requests).toHaveLength(2);
});

test('cancelling startup stops a worker still seeding its database', async () => {
  const { controller, pending, worker } = setup();
  const rejected = expect(pending).rejects.toThrow('stopped');
  controller.abort();
  await rejected;
  expect(worker.terminate).toHaveBeenCalled();
});

test('cancelling a pending page address stops its unmounted worker', async () => {
  const { controller, pending, worker } = setup({ $seedRef: 'game' });
  worker.reply('reset', null);
  await waitFor(() => expect(worker.requests).toHaveLength(2));
  const rejected = expect(pending).rejects.toThrow('stopped');
  controller.abort();
  await rejected;
  expect(worker.terminate).toHaveBeenCalled();
});

test('a mounted session retires on unmount, after setup hands over ownership', async () => {
  const { controller, pending, worker } = setup();
  worker.reply('reset', null);
  const { storybookDatabase: prepared } = await pending;
  clients.push(prepared!.client);
  const page = render(
    <StorybookDatabaseProvider prepared={prepared!}>
      <p>Ready</p>
    </StorybookDatabaseProvider>
  );
  controller.abort();
  expect(worker.terminate).not.toHaveBeenCalled();
  page.unmount();
  await expect(prepared!.client.resolve({ $seedRef: 'game' })).rejects.toThrow('story has finished');
});
