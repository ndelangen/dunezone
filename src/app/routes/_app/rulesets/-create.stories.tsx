import { Alert, Button, Code, Loader, Stack, Title } from '@mantine/core';
import preview from '@sb/preview';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute as createStoryRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { expect, mocked, userEvent, within } from 'storybook/test';

import { db } from '@db/core';
import type { SeedDocument, WorkerIdentity } from '@db/core/convexTestProtocol';
import type { ContextConformanceResult } from '@db/core/convexTestProtocol';
import {
  ConvexTestWorkerClient,
  ConvexTestWorkerContext,
  convexTestReferences,
  convexUseMutation,
  convexUseQuery,
  useConvexTestWorkerMutation,
  useConvexTestWorkerQuery,
} from '@db/core/convexTestStorybook';
import type { FunctionReturnType } from '@db/core/convexTestStorybook';

import { Route as RulesetDetailRoute } from './$rulesetSlug/index';
import {
  createdRuleset,
  createRulesetIdentity,
  createRulesetSeed,
  schedulerProbeSeed,
} from './-create.stories.fixture';
import { Route } from './create';

const RestartWorkerContext = createContext<(() => Promise<ConvexTestWorkerClient>) | null>(null);

function useRestartWorker() {
  const restart = useContext(RestartWorkerContext);
  if (!restart) {
    throw new Error('The story has no worker reset control.');
  }
  return restart;
}

function ActualCreateRulesetPage() {
  const Page = Route.options.component;
  if (!Page) {
    throw new Error('The create ruleset route has no page component.');
  }
  return <Page />;
}

function ActualRulesetDetailPage() {
  const Page = RulesetDetailRoute.options.component;
  if (!Page) {
    throw new Error('The ruleset detail route has no page component.');
  }
  return <Page />;
}

const rootRoute = createRootRoute({ component: Outlet });
const appRoute = createStoryRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: Outlet,
});
const createPageRoute = createStoryRoute({
  getParentRoute: () => appRoute,
  path: '/rulesets/create',
  component: ActualCreateRulesetPage,
});
const rulesetRoute = createStoryRoute({
  getParentRoute: () => appRoute,
  path: '/rulesets/$rulesetSlug',
  component: Outlet,
});
const rulesetDetailPageRoute = createStoryRoute({
  getParentRoute: () => rulesetRoute,
  path: '/',
  loader: async (context) => {
    const loader = RulesetDetailRoute.options.loader as
      | ((loaderContext: typeof context) => Promise<unknown>)
      | undefined;
    if (!loader) {
      throw new Error('The ruleset detail route has no loader.');
    }
    return await loader(context);
  },
  validateSearch: RulesetDetailRoute.options.validateSearch,
  component: ActualRulesetDetailPage,
});
const routeTree = rootRoute.addChildren([
  appRoute.addChildren([createPageRoute, rulesetRoute.addChildren([rulesetDetailPageRoute])]),
]);

function CreateRulesetStoryPage() {
  const restart = useRestartWorker();
  const router = useMemo(
    () =>
      createRouter({
        history: createMemoryHistory({ initialEntries: ['/rulesets/create'] }),
        routeTree,
      }),
    []
  );
  return (
    <>
      <RouterProvider router={router} />
      <button
        type="button"
        hidden
        data-story-worker-reset
        onClick={async () => {
          await restart();
          await router.navigate({ to: '/rulesets/create' });
        }}
      >
        Reset the story worker
      </button>
    </>
  );
}

type WorkerState =
  | { status: 'loading' }
  | { status: 'success'; client: ConvexTestWorkerClient }
  | { status: 'error'; message: string };

async function createSeededWorker(seed: SeedDocument[]) {
  const client = new ConvexTestWorkerClient();
  try {
    await client.reset(seed);
    return client;
  } catch (error) {
    client.terminate();
    throw error;
  }
}

async function retireWorker(client: ConvexTestWorkerClient | null) {
  if (!client) {
    return;
  }
  await client.waitForIdle();
  client.terminate();
}

function workerErrorState(error: unknown): WorkerState {
  return { status: 'error', message: error instanceof Error ? error.message : String(error) };
}

function useRestartableWorker(seed: SeedDocument[]) {
  const activeClient = useRef<ConvexTestWorkerClient | null>(null);
  const mounted = useRef(true);
  const [state, setState] = useState<WorkerState>({ status: 'loading' });

  const startWorker = useCallback(async () => {
    const nextClient = await createSeededWorker(seed);
    if (!mounted.current) {
      nextClient.terminate();
      throw new Error('The story stopped before its replacement worker started.');
    }
    await retireWorker(activeClient.current);
    activeClient.current = nextClient;
    setState({ status: 'success', client: nextClient });
    return nextClient;
  }, [seed]);

  useEffect(() => {
    mounted.current = true;
    void startWorker().catch((error: unknown) => setState(workerErrorState(error)));
    return () => {
      mounted.current = false;
      activeClient.current?.terminate();
      activeClient.current = null;
    };
  }, [startWorker]);

  return { startWorker, state };
}

function WithRestartableWorker({
  children,
  identity,
  seed,
}: Readonly<{ children: ReactNode; identity: WorkerIdentity; seed: SeedDocument[] }>) {
  const { startWorker, state } = useRestartableWorker(seed);

  if (state.status === 'loading') {
    return <Loader aria-label="Starting the authenticated Convex Storybook worker" />;
  }
  if (state.status === 'error') {
    return <Alert color="red">{state.message}</Alert>;
  }
  mocked(db.query).mockImplementation(((fn, args) => state.client.query(fn, args, identity)) as typeof db.query);
  return (
    <RestartWorkerContext.Provider value={startWorker}>
      <ConvexTestWorkerContext.Provider value={{ client: state.client, identity }}>
        {children}
      </ConvexTestWorkerContext.Provider>
    </RestartWorkerContext.Provider>
  );
}

const rulesetsList = convexTestReferences.rulesetsList;
const profileSession = convexTestReferences.profileSession;

function ResetStressPage() {
  const restart = useRestartWorker();
  const [status, setStatus] = useState('Ready to replace the worker 20 times');

  return (
    <Stack p="xl">
      <Title order={1}>Worker reset stress proof</Title>
      <Alert>{status}</Alert>
      <Button
        onClick={async () => {
          for (let count = 1; count <= 20; count += 1) {
            const client = await restart();
            const rows = await client.query(rulesetsList, {});
            if (rows.length !== 0) {
              throw new Error(`Reset ${count} retained ${rows.length} rulesets.`);
            }
            setStatus(`Reset ${count} of 20 completed with an empty rulesets table`);
          }
        }}
      >
        Run 20 worker resets
      </Button>
    </Stack>
  );
}

function assertIdentityIsolation(
  creator: { userId: string | null },
  observer: { userId: string | null },
  signedOut: { userId: string | null }
) {
  if (!creator.userId) {
    throw new Error('The worker lost the creator identity.');
  }
  if (!observer.userId) {
    throw new Error('The worker lost the observer identity.');
  }
  if (creator.userId === observer.userId) {
    throw new Error('The worker mixed its adjacent identities.');
  }
  if (signedOut.userId) {
    throw new Error('The worker authenticated a signed-out request.');
  }
}

function assertNetworkGuard(message: string) {
  if (message !== 'Convex Storybook workers cannot make network requests.') {
    throw new Error(`Unexpected network guard result: ${message}`);
  }
}

function assertLocalHttp(result: { body: { error?: string }; status: number }) {
  if (result.status !== 404 || result.body.error !== 'Not found') {
    throw new Error(`Unexpected local HTTP result: ${JSON.stringify(result)}`);
  }
}

function assertScheduledRebuild(result: Awaited<ReturnType<ConvexTestWorkerClient['runSchedulerProbe']>>) {
  if (result.after.users !== 1 || result.after.rulesets !== 1) {
    throw new Error(`Scheduled rebuild did not restore statistics: ${JSON.stringify(result.after)}`);
  }
}

function assertRollback(result: Awaited<ReturnType<ConvexTestWorkerClient['runRollbackProbe']>>) {
  if (result.error !== 'Intentional rollback probe' || result.usersAfterFailure !== 0) {
    throw new Error(`Unexpected rollback result: ${JSON.stringify(result)}`);
  }
}

function assertRootContextReturned(rows: FunctionReturnType<typeof convexTestReferences.rulesetsList>) {
  if (rows.length !== 1) {
    throw new Error(`The Aggregate component did not return to the root module: ${JSON.stringify(rows)}`);
  }
}

function assertMigrationsComponent(
  dashboard: FunctionReturnType<typeof convexTestReferences.migrationsAdminDashboard>,
  sync: FunctionReturnType<typeof convexTestReferences.migrationsSyncRuns>
) {
  const validResults = [Array.isArray(dashboard.statuses), Array.isArray(dashboard.snapshots), sync.synced === 0];
  if (validResults.includes(false)) {
    throw new Error(`The Migrations component returned an invalid result: ${JSON.stringify({ dashboard, sync })}`);
  }
}

async function runIsolationChecks(client: ConvexTestWorkerClient) {
  const [creator, observer, signedOut, networkMessage, httpResult] = await Promise.all([
    client.query(profileSession, {}, createRulesetIdentity),
    client.query(profileSession, {}, { name: 'Storybook observer', subjectKey: 'observer' }),
    client.query(profileSession, {}),
    client.runNetworkProbe(),
    client.runHttpProbe(),
  ]);
  assertIdentityIsolation(creator, observer, signedOut);
  assertNetworkGuard(networkMessage);
  assertLocalHttp(httpResult);

  const probeClient = await createSeededWorker(schedulerProbeSeed);
  try {
    assertScheduledRebuild(await probeClient.runSchedulerProbe());
    assertRootContextReturned(await probeClient.query(rulesetsList, {}));
    assertMigrationsComponent(
      await probeClient.query(convexTestReferences.migrationsAdminDashboard, { ids: [] }),
      await probeClient.mutation(convexTestReferences.migrationsSyncRuns, { ids: [] })
    );
    assertRollback(await probeClient.runRollbackProbe());
  } finally {
    await retireWorker(probeClient);
  }
}

function IdentityAndNetworkProofPage() {
  const { client } = useContext(ConvexTestWorkerContext) ?? {};
  const [status, setStatus] = useState('Ready to check worker isolation and backend behavior');

  if (!client) {
    throw new Error('The story has no Convex worker client.');
  }

  return (
    <Stack p="xl">
      <Title order={1}>Worker isolation proof</Title>
      <Alert>{status}</Alert>
      <Button
        onClick={async () => {
          await runIsolationChecks(client);
          setStatus(
            'Identities stayed separate; fetch was blocked; Aggregate, Migrations, scheduling, and rollback passed'
          );
        }}
      >
        Run isolation checks
      </Button>
    </Stack>
  );
}

function useContextConformance() {
  const { client } = useContext(ConvexTestWorkerContext) ?? {};
  const [result, setResult] = useState<ContextConformanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }
    void client
      .runContextConformance()
      .then(setResult)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [client]);

  if (!client) {
    throw new Error('The story has no Convex worker client.');
  }
  if (error) {
    throw new Error(error);
  }
  return result;
}

function ZoneContextConformancePage() {
  const result = useContextConformance();
  if (!result) {
    return <Loader aria-label="Running the Zone context conformance check" />;
  }
  return (
    <Stack maw={760} p="xl">
      <Title order={1}>After: faithful browser context</Title>
      <Alert color="green" title={`${result.ambient.mismatches} of 5 checkpoints used the wrong frame`}>
        Overlapping component scopes retained their sibling and caller context.
      </Alert>
      <Alert color="green" title={`${result.explicit.mismatches} mismatches across ${result.explicit.iterations} runs`}>
        Context survived {result.explicit.sources.join(', ')}, parallel components, and the return to root.
      </Alert>
      <Alert color={result.convexHelper.status === 'supported' ? 'green' : 'red'} title="Convex helper compatibility">
        {result.convexHelper.status === 'supported'
          ? `createFunctionHandle completed inside the browser runtime: ${result.convexHelper.handle}`
          : result.convexHelper.error}
      </Alert>
      <Code block>{JSON.stringify(result.ambient.trace, null, 2)}</Code>
    </Stack>
  );
}

const meta = preview.meta({
  title: 'Create ruleset',
  component: CreateRulesetStoryPage,
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appDesktop' } },
  beforeEach: () => {
    mocked(convexUseQuery).mockImplementation(useConvexTestWorkerQuery as typeof convexUseQuery);
    mocked(convexUseMutation).mockImplementation(useConvexTestWorkerMutation as typeof convexUseMutation);
  },
  decorators: [
    (Story) => (
      <WithRestartableWorker identity={createRulesetIdentity} seed={createRulesetSeed}>
        <Story />
      </WithRestartableWorker>
    ),
  ],
});

async function createThroughPage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
  await userEvent.type(name, createdRuleset.name);
  await userEvent.type(page.getByRole('textbox', { name: 'About' }), createdRuleset.about);
  await userEvent.click(page.getByRole('button', { name: 'Create' }));
  await expect(page.findByRole('heading', { name: createdRuleset.name }, { timeout: 30_000 })).resolves.toBeVisible();
  await expect(page.findByText(createdRuleset.about, {}, { timeout: 30_000 })).resolves.toBeVisible();
  return page;
}

export const CreateResetAndCreateAgain = meta.story({
  play: async ({ canvasElement }) => {
    const page = await createThroughPage(canvasElement);
    const reset = canvasElement.ownerDocument.querySelector<HTMLButtonElement>('[data-story-worker-reset]');
    if (!reset) {
      throw new Error('The story worker reset control is missing.');
    }
    reset.click();
    await expect(page.findByRole('heading', { name: 'Create ruleset' }, { timeout: 30_000 })).resolves.toBeVisible();
    await createThroughPage(canvasElement);
  },
});

export const TwentyCleanWorkerResets = meta.story({
  render: () => <ResetStressPage />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Run 20 worker resets' }, { timeout: 30_000 }));
    await expect(
      page.findByText('Reset 20 of 20 completed with an empty rulesets table', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

export const IdentitiesAndNetworkStayIsolated = meta.story({
  render: () => <IdentityAndNetworkProofPage />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Run isolation checks' }, { timeout: 30_000 }));
    await expect(
      page.findByText(
        'Identities stayed separate; fetch was blocked; Aggregate, Migrations, scheduling, and rollback passed',
        {},
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
  },
});

export const ZoneContextConformance = meta.story({
  render: () => <ZoneContextConformancePage />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('0 of 5 checkpoints used the wrong frame', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByText('0 mismatches across 100 runs', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByText(/createFunctionHandle completed inside the browser runtime/, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});
