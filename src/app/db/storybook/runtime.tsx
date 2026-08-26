import {
  useMutation as convexUseMutation,
  usePaginatedQuery as convexUsePaginatedQuery,
  useQuery as convexUseQuery,
} from 'convex/react';
import type {
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryReference,
  PaginationStatus,
  UsePaginatedQueryReturnType,
} from 'convex/react';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType, PaginationResult } from 'convex/server';
import { convexToJson, jsonToConvex } from 'convex/values';
import type { Value as ConvexValue } from 'convex/values';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { api } from '../../../../convex/_generated/api';
import type {
  ContextConformanceResult,
  RollbackProbeResult,
  SchedulerProbeResult,
  SeedDocument,
  WorkerIdentity,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

type WithoutId<Request> = Request extends unknown ? Omit<Request, 'id'> : never;
type WorkerRequestPayload = WithoutId<WorkerRequest>;

export class ConvexStorybookWorkerClient {
  private readonly worker = new Worker(new URL('./convexStorybook.worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Set<() => void>();
  private nextId = 1;
  private revision = 0;

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error));
      }
    });
    this.worker.addEventListener('error', (event) => {
      this.rejectPending(new Error(event.message));
    });
  }

  query = async <Query extends FunctionReference<'query'>>(
    fn: Query,
    args: FunctionArgs<Query>,
    identity?: WorkerIdentity
  ): Promise<FunctionReturnType<Query>> => {
    return (await this.request({
      operation: 'query',
      name: getFunctionName(fn),
      args,
      identity,
    })) as FunctionReturnType<Query>;
  };

  mutation = async <Mutation extends FunctionReference<'mutation'>>(
    fn: Mutation,
    args: FunctionArgs<Mutation>,
    identity?: WorkerIdentity
  ): Promise<FunctionReturnType<Mutation>> => {
    const result = (await this.request({
      operation: 'mutation',
      name: getFunctionName(fn),
      args,
      identity,
    })) as FunctionReturnType<Mutation>;
    this.notifyQueries();
    return result;
  };

  reset = async (seed: SeedDocument[]) => {
    await this.request({ operation: 'reset', seed });
    this.notifyQueries();
  };

  runNetworkProbe = async () => (await this.request({ operation: 'networkProbe' })) as string;

  runSubworkerProbe = async () => (await this.request({ operation: 'subworkerProbe' })) as string;

  runHttpProbe = async () =>
    (await this.request({ operation: 'httpProbe' })) as { body: { error?: string }; status: number };

  runSchedulerProbe = async () => (await this.request({ operation: 'schedulerProbe' })) as SchedulerProbeResult;

  runRollbackProbe = async () => (await this.request({ operation: 'rollbackProbe' })) as RollbackProbeResult;

  runContextConformance = async () =>
    (await this.request({ operation: 'contextConformance' })) as ContextConformanceResult;

  waitForIdle = async () => await this.request({ operation: 'ping' });

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = () => this.revision;

  terminate() {
    this.worker.terminate();
    this.rejectPending(new Error('The Convex Storybook worker stopped.'));
  }

  private notifyQueries() {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async request(request: WorkerRequestPayload): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id } satisfies WorkerRequest);
    });
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export type ConvexStorybookWorkerSession = {
  client: ConvexStorybookWorkerClient;
  identity?: WorkerIdentity;
};

export const ConvexStorybookWorkerContext = createContext<ConvexStorybookWorkerSession | null>(null);

function useConvexStorybookWorkerSession() {
  const session = useContext(ConvexStorybookWorkerContext);
  if (!session) {
    throw new Error('The story has no Convex worker client.');
  }
  return session;
}

function useStableConvexValue<Value>(value: Value) {
  const serialized = JSON.stringify(convexToJson(value as ConvexValue));
  return useMemo(() => jsonToConvex(JSON.parse(serialized)) as Value, [serialized]);
}

export function useConvexStorybookQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): FunctionReturnType<Query> | undefined {
  const { client, identity } = useConvexStorybookWorkerSession();
  const revision = useSyncExternalStore(client.subscribe, client.getRevision, client.getRevision);
  const name = getFunctionName(query);
  const stableQuery = useMemo(() => makeFunctionReference(name) as Query, [name]);
  const stableArgs = useStableConvexValue(args);
  const [value, setValue] = useState<FunctionReturnType<Query>>();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setValue(undefined);
  }, [client, identity, stableArgs, stableQuery]);

  useEffect(() => {
    let active = true;
    setError(null);
    void client
      .query(stableQuery, stableArgs, identity)
      .then((result) => {
        if (active) {
          setValue(result);
        }
      })
      .catch((queryError: unknown) => {
        if (active) {
          setError(queryError instanceof Error ? queryError : new Error(String(queryError)));
        }
      });
    return () => {
      active = false;
    };
  }, [client, identity, revision, stableArgs, stableQuery]);

  if (error) {
    throw error;
  }
  return value;
}

export function useConvexStorybookMutation<Mutation extends FunctionReference<'mutation'>>(mutation: Mutation) {
  const { client, identity } = useConvexStorybookWorkerSession();
  return useCallback(
    async (args: FunctionArgs<Mutation>) => await client.mutation(mutation, args, identity),
    [client, identity, mutation]
  );
}

type PageRequest = { cursor: string | null; numItems: number };

export function useConvexStorybookPaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | 'skip',
  options: { initialNumItems: number }
): UsePaginatedQueryReturnType<Query> {
  const { client, identity } = useConvexStorybookWorkerSession();
  const revision = useSyncExternalStore(client.subscribe, client.getRevision, client.getRevision);
  const name = getFunctionName(query);
  const stableQuery = useMemo(() => makeFunctionReference(name) as Query, [name]);
  const stableArgs = useStableConvexValue(args);
  const [requests, setRequests] = useState<PageRequest[]>([{ cursor: null, numItems: options.initialNumItems }]);
  const [pages, setPages] = useState<Array<PaginationResult<PaginatedQueryItem<Query>>>>([]);
  const [status, setStatus] = useState<PaginationStatus>('LoadingFirstPage');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setRequests(stableArgs === 'skip' ? [] : [{ cursor: null, numItems: options.initialNumItems }]);
    setPages([]);
    setStatus(stableArgs === 'skip' ? 'Exhausted' : 'LoadingFirstPage');
  }, [client, identity, options.initialNumItems, stableArgs, stableQuery]);

  useEffect(() => {
    if (stableArgs === 'skip' || requests.length === 0) {
      return;
    }
    const queryArgsBase = stableArgs as Record<string, ConvexValue>;
    let active = true;
    setError(null);
    void Promise.all(
      requests.map(async (request) => {
        const queryArgs = { ...queryArgsBase, paginationOpts: request } as FunctionArgs<Query>;
        return (await client.query(stableQuery, queryArgs, identity)) as PaginationResult<PaginatedQueryItem<Query>>;
      })
    )
      .then((nextPages) => {
        if (active) {
          setPages(nextPages);
          setStatus(nextPages.at(-1)?.isDone === false ? 'CanLoadMore' : 'Exhausted');
        }
      })
      .catch((queryError: unknown) => {
        if (active) {
          setError(queryError instanceof Error ? queryError : new Error(String(queryError)));
        }
      });
    return () => {
      active = false;
    };
  }, [client, identity, requests, revision, stableArgs, stableQuery]);

  const loadMore = useCallback(
    (numItems: number) => {
      const lastPage = pages.at(-1);
      if (status !== 'CanLoadMore' || !lastPage) {
        return;
      }
      setStatus('LoadingMore');
      setRequests((current) => [...current, { cursor: lastPage.continueCursor, numItems }]);
    },
    [pages, status]
  );

  if (error) {
    throw error;
  }
  return {
    results: pages.flatMap((page) => page.page),
    status,
    isLoading: status === 'LoadingFirstPage' || status === 'LoadingMore',
    loadMore,
  } as UsePaginatedQueryReturnType<Query>;
}

export const convexStorybookReferences = {
  migrationsAdminDashboard: api.migrations.adminDashboard,
  migrationsSyncRuns: api.migrations.syncMigrationRuns,
  profileSession: api.profiles.session,
  rulesetsList: api.rulesets.list,
};

export { convexUseMutation, convexUsePaginatedQuery, convexUseQuery };
export type { FunctionArgs, FunctionReference, FunctionReturnType };
