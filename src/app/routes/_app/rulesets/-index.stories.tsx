import { Alert, Code, Loader, Stack, Title } from '@mantine/core';
import preview from '@sb/preview';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { mocked } from 'storybook/test';

import { db } from '@db/core';
import {
  ConvexTestWorkerClient,
  ConvexTestWorkerContext,
  convexUseQuery,
  useConvexTestWorkerQuery,
  useConvexTestWorkerSession,
} from '@db/core/convexTestStorybook';

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

function useRulesetsLoader(client: ConvexTestWorkerClient) {
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

function useSubscriptionMutation(client: ConvexTestWorkerClient, enabled: boolean, loaderStatus: LoadState['status']) {
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
  const { client } = useConvexTestWorkerSession();
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
    { status: 'loading' } | { status: 'success'; client: ConvexTestWorkerClient } | { status: 'error'; message: string }
  >({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const client = new ConvexTestWorkerClient();
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
  return (
    <ConvexTestWorkerContext.Provider value={{ client: state.client }}>{children}</ConvexTestWorkerContext.Provider>
  );
}

function ConcurrencyProof() {
  const { client } = useConvexTestWorkerSession();
  const [message, setMessage] = useState('Running two overlapping Convex contexts');
  useEffect(() => {
    void client
      .runConcurrencyProbe(firstConcurrencySeed, secondConcurrencySeed)
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
    mocked(convexUseQuery).mockImplementation(useConvexTestWorkerQuery as typeof convexUseQuery);
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
