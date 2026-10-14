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
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReference_future,
  FunctionReturnType,
  PaginationResult,
} from 'convex/server';
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
  SeedReference,
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

  query = async <Query extends FunctionReference<'query'> | FunctionReference_future<'query'>>(
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

  mutation = async <Mutation extends FunctionReference<'mutation'> | FunctionReference_future<'mutation'>>(
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

  action = async <Action extends FunctionReference<'action'> | FunctionReference_future<'action'>>(
    fn: Action,
    args: FunctionArgs<Action>,
    identity?: WorkerIdentity
  ): Promise<FunctionReturnType<Action>> => {
    try {
      return (await this.request({
        operation: 'action',
        name: getFunctionName(fn),
        args,
        identity,
      })) as FunctionReturnType<Action>;
    } finally {
      this.notifyQueries();
    }
  };

  reset = async (seed: SeedDocument[]) => {
    await this.request({ operation: 'reset', seed });
    this.resolved.clear();
    this.notifyQueries();
  };

  private readonly resolved = new Map<string, Promise<string>>();

  /** A seed reference resolved to its id or text. The promise is kept per reference so `use()` reads one thenable. */
  resolve = (reference: SeedReference): Promise<string> => {
    const key = `${reference.$seedRef}\n${reference.$seedText ?? ''}`;
    let pending = this.resolved.get(key);
    if (!pending) {
      pending = this.request({ operation: 'resolve', reference }) as Promise<string>;
      this.resolved.set(key, pending);
    }
    return pending;
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

export function useConvexStorybookQuery<Query extends FunctionReference<'query'> | FunctionReference_future<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): FunctionReturnType<Query> | undefined {
  const { client, identity } = useConvexStorybookWorkerSession();
  const revision = useSyncExternalStore(client.subscribe, client.getRevision, client.getRevision);
  const name = getFunctionName(query);
  const stableQuery = useMemo(() => makeFunctionReference(name) as Query, [name]);
  const stableArgs = useStableConvexValue(args);
  const input = useMemo(
    () => ({ client, identity, stableArgs, stableQuery }),
    [client, identity, stableArgs, stableQuery]
  );
  const [result, setResult] = useState<{
    input: typeof input;
    revision: number;
    value?: FunctionReturnType<Query>;
    error?: Error;
  }>();

  useEffect(() => {
    let active = true;
    void client
      .query(stableQuery, stableArgs, identity)
      .then((value) => {
        if (active) {
          setResult({ input, revision, value });
        }
      })
      .catch((queryError: unknown) => {
        if (active) {
          setResult({
            input,
            revision,
            error: queryError instanceof Error ? queryError : new Error(String(queryError)),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [client, identity, input, revision, stableArgs, stableQuery]);

  /* A changed argument clears immediately; a revision keeps the last value until its replacement arrives. */
  if (result?.input !== input) {
    return undefined;
  }
  if (result.error && result.revision === revision) {
    throw result.error;
  }
  return result.value;
}

export function useConvexStorybookMutation<
  Mutation extends FunctionReference<'mutation'> | FunctionReference_future<'mutation'>,
>(mutation: Mutation) {
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
  const initialNumItems = options.initialNumItems;
  const input = useMemo(
    () => ({ client, identity, stableArgs, stableQuery, initialNumItems }),
    [client, identity, stableArgs, stableQuery, initialNumItems]
  );
  type Pages = {
    input: typeof input;
    requests: PageRequest[];
    pages: Array<PaginationResult<PaginatedQueryItem<Query>>>;
    status: PaginationStatus;
    error?: { revision: number; cause: Error };
  };
  const initialPages = (): Pages => ({
    input,
    requests: stableArgs === 'skip' ? [] : [{ cursor: null, numItems: initialNumItems }],
    pages: [],
    status: stableArgs === 'skip' ? 'Exhausted' : 'LoadingFirstPage',
  });
  const [state, setState] = useState(initialPages);
  if (state.input !== input) {
    setState(initialPages());
  }
  const requests = state.requests;

  useEffect(() => {
    if (stableArgs === 'skip' || requests.length === 0 || state.input !== input) {
      return;
    }
    const queryArgsBase = stableArgs as Record<string, ConvexValue>;
    let active = true;
    void Promise.all(
      requests.map(async (request) => {
        const queryArgs = { ...queryArgsBase, paginationOpts: request } as FunctionArgs<Query>;
        return (await client.query(stableQuery, queryArgs, identity)) as PaginationResult<PaginatedQueryItem<Query>>;
      })
    )
      .then((pages) => {
        if (active) {
          setState((current) =>
            current.input === input
              ? {
                  ...current,
                  pages,
                  status: pages.at(-1)?.isDone === false ? 'CanLoadMore' : 'Exhausted',
                  error: undefined,
                }
              : current
          );
        }
      })
      .catch((queryError: unknown) => {
        if (active) {
          const cause = queryError instanceof Error ? queryError : new Error(String(queryError));
          setState((current) => (current.input === input ? { ...current, error: { revision, cause } } : current));
        }
      });
    return () => {
      active = false;
    };
  }, [client, identity, input, requests, revision, stableArgs, stableQuery, state.input]);

  const loadMore = useCallback(
    (numItems: number) => {
      setState((current) => {
        const lastPage = current.pages.at(-1);
        if (current.input !== input || current.status !== 'CanLoadMore' || !lastPage) {
          return current;
        }
        return {
          ...current,
          status: 'LoadingMore',
          requests: [...current.requests, { cursor: lastPage.continueCursor, numItems }],
        };
      });
    },
    [input]
  );

  if (state.input === input && state.error?.revision === revision) {
    throw state.error.cause;
  }
  return {
    results: state.pages.flatMap((page) => page.page),
    status: state.status,
    isLoading: state.status === 'LoadingFirstPage' || state.status === 'LoadingMore',
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
