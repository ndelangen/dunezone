import { Alert, Code, Loader, Stack, Title } from '@mantine/core';
import preview from '@sb/preview';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { mocked } from 'storybook/test';

import { db } from '@db/core';
import type { SeedDocument, WorkerRequest, WorkerResponse } from '@db/core/convexTestProtocol';
import { convexUseQuery, getFunctionName } from '@db/core/convexTestStorybook';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from '@db/core/convexTestStorybook';

import {
  firstConcurrencySeed,
  initialRulesetsSeed,
  secondConcurrencySeed,
  subscriptionRulesetSeed,
} from './-index.stories.fixture';
import { Route } from './index';

type RouteLoader = Extract<NonNullable<typeof Route.options.loader>, (...args: never[]) => unknown>;
type LoaderData = Awaited<ReturnType<RouteLoader>>;
type LoadState = { status: 'loading' } | { status: 'success' } | { status: 'error'; message: string };
type WithoutId<Request> = Request extends unknown ? Omit<Request, 'id'> : never;
type WorkerRequestPayload = WithoutId<WorkerRequest>;

class WorkerClient {
  private readonly worker = new Worker(new URL('../../../db/core/convexTest.worker.ts', import.meta.url), {
    type: 'module',
  });
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
    args: FunctionArgs<Query>
  ): Promise<FunctionReturnType<Query>> => {
    return (await this.request({ operation: 'query', name: getFunctionName(fn), args })) as FunctionReturnType<Query>;
  };

  reset = async (seed: SeedDocument[]) => await this.request({ operation: 'reset', seed });

  insert = async (documents: SeedDocument[]) => {
    await this.request({ operation: 'insert', documents });
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  };

  runConcurrencyProbe = async () =>
    await this.request({
      operation: 'concurrency',
      name: 'rulesets:list',
      args: {},
      first: firstConcurrencySeed,
      second: secondConcurrencySeed,
    });

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = () => this.revision;

  terminate() {
    this.worker.terminate();
    this.rejectPending(new Error('The Convex Storybook worker stopped.'));
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

const WorkerClientContext = createContext<WorkerClient | null>(null);

function useWorkerClient() {
  const client = useContext(WorkerClientContext);
  if (!client) {
    throw new Error('The story has no Convex worker client.');
  }
  return client;
}

function useWorkerQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query> | 'skip'
): FunctionReturnType<Query> | undefined {
  const client = useWorkerClient();
  const revision = useSyncExternalStore(client.subscribe, client.getRevision, client.getRevision);
  const name = getFunctionName(query);
  const serializedArgs = args === 'skip' ? 'skip' : JSON.stringify(args);
  const stableArgs = useMemo(
    () => (serializedArgs === 'skip' ? 'skip' : (JSON.parse(serializedArgs) as FunctionArgs<Query>)),
    [serializedArgs]
  );
  const [value, setValue] = useState<FunctionReturnType<Query>>();

  useEffect(() => {
    if (stableArgs === 'skip') {
      setValue(undefined);
      return;
    }
    let active = true;
    void client.query(query, stableArgs).then((result) => {
      if (active) {
        setValue(result);
      }
    });
    return () => {
      active = false;
    };
  }, [client, name, query, revision, stableArgs]);

  return value;
}

let currentLoaderData: LoaderData | null = null;
const applicationUseLoaderData = Route.useLoaderData;

function ActualRulesetsPage() {
  const Page = Route.options.component;
  if (!Page) {
    throw new Error('The rulesets route has no page component.');
  }
  return <Page />;
}

function RoutedRulesetsPage() {
  const router = useMemo(() => {
    const component = () => <ActualRulesetsPage />;
    const rootRoute = createRootRoute({ component });
    return createRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: rootRoute,
    });
  }, []);
  return <RouterProvider router={router} />;
}

function useRulesetsLoader(client: WorkerClient) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const originalQuery = db.query;
    const loader = Route.options.loader as RouteLoader;
    db.query = client.query;
    void loader({} as never)
      .then((data: LoaderData) => {
        if (active) {
          currentLoaderData = data;
          setState({ status: 'success' });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      })
      .finally(() => {
        db.query = originalQuery;
      });
    return () => {
      active = false;
      db.query = originalQuery;
    };
  }, [client]);
  return state;
}

function useSubscriptionMutation(client: WorkerClient, enabled: boolean, loaderStatus: LoadState['status']) {
  const [status, setStatus] = useState('Waiting to mutate the worker database');
  const inserted = useRef(false);
  useEffect(() => {
    if (!enabled || loaderStatus !== 'success' || inserted.current) {
      return;
    }
    const timeout = window.setTimeout(() => {
      inserted.current = true;
      setStatus('Inserting a third ruleset in the worker database');
      void client
        .insert(subscriptionRulesetSeed)
        .then(() => setStatus('Mutation completed; active queries reran'))
        .catch((error: unknown) =>
          setStatus(error instanceof Error ? error.message : `Mutation failed: ${String(error)}`)
        );
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [client, enabled, loaderStatus]);
  return status;
}

function WorkerBackedPage({ insertAfterLoad = false }: Readonly<{ insertAfterLoad?: boolean }>) {
  const client = useWorkerClient();
  const state = useRulesetsLoader(client);
  const mutationStatus = useSubscriptionMutation(client, insertAfterLoad, state.status);

  if (state.status === 'loading') {
    return <Loader aria-label="Running the route loader in the Convex worker" />;
  }
  if (state.status === 'error') {
    return <Alert color="red">{state.message}</Alert>;
  }
  return (
    <>
      {insertAfterLoad ? <Alert title="Worker subscription bridge">{mutationStatus}</Alert> : null}
      <RoutedRulesetsPage />
    </>
  );
}

function WithWorker({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'success'; client: WorkerClient } | { status: 'error'; message: string }
  >({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const client = new WorkerClient();
    void client
      .reset(initialRulesetsSeed)
      .then(() => {
        if (active) {
          setState({ status: 'success', client });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      active = false;
      client.terminate();
    };
  }, []);
  if (state.status === 'loading') {
    return <Loader aria-label="Starting the Convex Storybook worker" />;
  }
  if (state.status === 'error') {
    return <Alert color="red">{state.message}</Alert>;
  }
  return <WorkerClientContext.Provider value={state.client}>{children}</WorkerClientContext.Provider>;
}

function ConcurrencyProof() {
  const client = useWorkerClient();
  const [message, setMessage] = useState('Running two overlapping Convex contexts');
  useEffect(() => {
    void client
      .runConcurrencyProbe()
      .then(() => setMessage('The two contexts unexpectedly remained isolated'))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [client]);
  return (
    <Stack p="xl">
      <Title order={1}>Concurrency boundary</Title>
      <Code block>{message}</Code>
    </Stack>
  );
}

const component = WorkerBackedPage;
const meta = preview.meta({
  title: 'Rulesets',
  component,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    mocked(convexUseQuery).mockImplementation(useWorkerQuery as typeof convexUseQuery);
    Route.useLoaderData = (() => {
      if (!currentLoaderData) {
        throw new Error('The Rulesets story route loader has not completed.');
      }
      return currentLoaderData;
    }) as typeof Route.useLoaderData;
    return () => {
      currentLoaderData = null;
      Route.useLoaderData = applicationUseLoaderData;
    };
  },
  decorators: [
    (Story) => (
      <WithWorker>
        <Story />
      </WithWorker>
    ),
  ],
});

export const WholePage = meta.story({
  render: () => <WorkerBackedPage />,
  globals: { viewport: { value: 'appDesktop' } },
});

export const MutationRerunsSubscription = meta.story({
  render: () => <WorkerBackedPage insertAfterLoad />,
  globals: { viewport: { value: 'appDesktop' } },
});

export const ConcurrentContexts = meta.story({
  render: () => <ConcurrencyProof />,
});
