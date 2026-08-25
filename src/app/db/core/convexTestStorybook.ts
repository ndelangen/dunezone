import { useMutation as convexUseMutation, useQuery as convexUseQuery } from 'convex/react';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import type {
  ContextConformanceResult,
  RollbackProbeResult,
  SchedulerProbeResult,
  SeedDocument,
  WorkerIdentity,
  WorkerRequest,
  WorkerResponse,
} from './convexTestProtocol';

type WithoutId<Request> = Request extends unknown ? Omit<Request, 'id'> : never;
type WorkerRequestPayload = WithoutId<WorkerRequest>;

export class ConvexTestWorkerClient {
  private readonly worker = new Worker(new URL('./convexTest.worker.ts', import.meta.url), { type: 'module' });
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

  insert = async (documents: SeedDocument[]) => {
    await this.request({ operation: 'insert', documents });
    this.notifyQueries();
  };

  runConcurrencyProbe = async (first: SeedDocument[], second: SeedDocument[]) =>
    await this.request({
      operation: 'concurrency',
      name: 'rulesets:list',
      args: {},
      first,
      second,
    });

  runNetworkProbe = async () => (await this.request({ operation: 'networkProbe' })) as string;

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

export type ConvexTestWorkerSession = {
  client: ConvexTestWorkerClient;
  identity?: WorkerIdentity;
};

export const ConvexTestWorkerContext = createContext<ConvexTestWorkerSession | null>(null);

export function useConvexTestWorkerSession() {
  const session = useContext(ConvexTestWorkerContext);
  if (!session) {
    throw new Error('The story has no Convex worker client.');
  }
  return session;
}

export function useConvexTestWorkerQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): FunctionReturnType<Query> | undefined {
  const { client, identity } = useConvexTestWorkerSession();
  const revision = useSyncExternalStore(client.subscribe, client.getRevision, client.getRevision);
  const name = getFunctionName(query);
  const stableQuery = useMemo(() => makeFunctionReference(name) as Query, [name]);
  const serializedArgs = JSON.stringify(args);
  const stableArgs = useMemo(() => JSON.parse(serializedArgs) as FunctionArgs<Query>, [serializedArgs]);
  const [value, setValue] = useState<FunctionReturnType<Query>>();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setValue(undefined);
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

export function useConvexTestWorkerMutation<Mutation extends FunctionReference<'mutation'>>(mutation: Mutation) {
  const { client, identity } = useConvexTestWorkerSession();
  return useCallback(
    async (args: FunctionArgs<Mutation>) => await client.mutation(mutation, args, identity),
    [client, identity, mutation]
  );
}

export { convexUseMutation, convexUseQuery, makeFunctionReference };
export type { FunctionArgs, FunctionReference, FunctionReturnType };
