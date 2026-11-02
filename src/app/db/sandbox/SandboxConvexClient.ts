import type { ConvexReactClient, Watch } from 'convex/react';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { convexToJson } from 'convex/values';
import type { Value as ConvexValue } from 'convex/values';

import type { WorkerIdentity } from '../storybook/protocol';
import type { ConvexStorybookWorkerClient } from '../storybook/runtime';

/*
 * A Convex client whose backend is the in-memory database in a web worker: the real Convex functions over seeded rows, as page stories run.
 * It answers the part of `ConvexReactClient` the app's hooks and Convex Auth reach, so a page under a provider holding it works unchanged.
 * Every mutation and action re-runs the watched queries, as a deployment pushes new results to its subscribers.
 */

type Entry = {
  name: string;
  args: Record<string, ConvexValue>;
  value: unknown;
  error: Error | null;
  loaded: boolean;
  listeners: Set<() => void>;
  /* Bumped per fetch, so an older answer that arrives late does not overwrite a newer one. */
  fetch: number;
};

/** Never a real address: Convex Auth's unauthenticated calls go to it, and must fail rather than reach a deployment. */
const SANDBOX_ADDRESS = 'https://sandbox.invalid';

export class SandboxConvexClient {
  private readonly entries = new Map<string, Entry>();
  private unsubscribeBackend: () => void;
  readonly address = SANDBOX_ADDRESS;
  readonly url = SANDBOX_ADDRESS;
  readonly options = { verbose: false };
  readonly logger = {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    logVerbose: () => undefined,
  };

  constructor(
    private backend: ConvexStorybookWorkerClient,
    private readonly identity: WorkerIdentity | undefined
  ) {
    this.unsubscribeBackend = backend.subscribe(() => this.refetchAll());
  }

  /** The client as Convex's own hooks type it; the parts they reach are all here. */
  asConvexClient(): ConvexReactClient {
    return this as unknown as ConvexReactClient;
  }

  watchQuery(query: FunctionReference<'query'>, args: Record<string, ConvexValue> = {}): Watch<unknown> {
    const name = getFunctionName(query);
    const key = JSON.stringify([name, convexToJson(args)]);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { name, args, value: undefined, error: null, loaded: false, listeners: new Set(), fetch: 0 };
      this.entries.set(key, entry);
    }
    const watched = entry;
    return {
      onUpdate: (callback: () => void) => {
        watched.listeners.add(callback);
        if (!watched.loaded && watched.fetch === 0) {
          void this.refetch(watched);
        }
        return () => {
          watched.listeners.delete(callback);
        };
      },
      localQueryResult: () => {
        if (watched.error) {
          throw watched.error;
        }
        return watched.loaded ? watched.value : undefined;
      },
      localQueryLogs: () => undefined,
      journal: () => undefined,
    } as Watch<unknown>;
  }

  async query(query: FunctionReference<'query'>, args: Record<string, ConvexValue> = {}) {
    return await this.backend.query(query, args as never, this.identity);
  }

  async mutation(mutation: FunctionReference<'mutation'>, args: Record<string, ConvexValue> = {}) {
    return await this.backend.mutation(mutation, args as never, this.identity);
  }

  async action(action: FunctionReference<'action'>, args: Record<string, ConvexValue> = {}) {
    return await this.backend.action(action, args as never, this.identity);
  }

  /* Convex Auth hands over its token here; the worker is told who is asking with each call instead. */
  setAuth(_fetchToken: unknown, onChange?: (isAuthenticated: boolean) => void) {
    queueMicrotask(() => onChange?.(true));
  }

  clearAuth() {}

  connectionState() {
    return {
      hasInflightRequests: false,
      isWebSocketConnected: true,
      timeOfOldestInflightRequest: null,
      hasEverConnected: true,
      connectionCount: 1,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    };
  }

  subscribeToConnectionState() {
    return () => undefined;
  }

  prewarmQuery() {}

  /** Points the client at a freshly seeded database, as Reset does, and asks every watched query again. */
  replaceBackend(backend: ConvexStorybookWorkerClient) {
    this.unsubscribeBackend();
    this.backend = backend;
    this.unsubscribeBackend = backend.subscribe(() => this.refetchAll());
    this.refetchAll();
  }

  async close() {
    this.unsubscribeBackend();
    this.entries.clear();
  }

  private refetchAll() {
    for (const entry of this.entries.values()) {
      if (entry.listeners.size > 0) {
        void this.refetch(entry);
      } else {
        /* Nobody watches it now, so a later watcher asks afresh rather than reading what may be stale. */
        entry.loaded = false;
        entry.fetch = 0;
      }
    }
  }

  private async refetch(entry: Entry) {
    entry.fetch += 1;
    const fetch = entry.fetch;
    try {
      const value = await this.backend.query(
        makeFunctionReference<'query'>(entry.name),
        entry.args as never,
        this.identity
      );
      if (fetch !== entry.fetch) {
        return;
      }
      entry.value = value;
      entry.error = null;
    } catch (error) {
      if (fetch !== entry.fetch) {
        return;
      }
      entry.error = error instanceof Error ? error : new Error(String(error));
    }
    entry.loaded = true;
    for (const listener of entry.listeners) {
      listener();
    }
  }
}
