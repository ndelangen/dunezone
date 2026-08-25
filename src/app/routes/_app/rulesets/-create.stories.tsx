import { Alert, Button, Code, Loader, Stack, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute as createStoryRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { expect, mocked, userEvent, within } from 'storybook/test';

import type { SeedDocument, WorkerIdentity } from '@db/core/convexTestProtocol';
import {
  ConvexTestWorkerClient,
  ConvexTestWorkerContext,
  convexUseMutation,
  convexUseQuery,
  makeFunctionReference,
  useConvexTestWorkerMutation,
  useConvexTestWorkerQuery,
} from '@db/core/convexTestStorybook';
import { useRulesetsAll } from '@db/rulesets';

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

function CreatedRulesetPage() {
  const navigate = useNavigate();
  const restart = useRestartWorker();
  const rulesets = useRulesetsAll();
  const params = useParams({ strict: false }) as { rulesetSlug: string };
  const created = rulesets.data?.find((ruleset) => ruleset.slug === params.rulesetSlug);

  return (
    <Stack p="xl">
      <Title order={1}>Created {params.rulesetSlug}</Title>
      {created ? (
        <Alert color="green" title="Worker mutation completed">
          Database contains {created.name}
        </Alert>
      ) : (
        <Loader aria-label="Reading the created ruleset from the worker" />
      )}
      <Text>The real page navigated here after the real mutation committed.</Text>
      <Code block>{JSON.stringify(rulesets.data ?? [], null, 2)}</Code>
      <Button
        onClick={async () => {
          await restart();
          await navigate({ to: '/rulesets/create' });
        }}
      >
        Reset database and create again
      </Button>
    </Stack>
  );
}

const rootRoute = createRootRoute({ component: Outlet });
const createPageRoute = createStoryRoute({
  getParentRoute: () => rootRoute,
  path: '/rulesets/create',
  component: ActualCreateRulesetPage,
});
const createdRoute = createStoryRoute({
  getParentRoute: () => rootRoute,
  path: '/rulesets/$rulesetSlug',
  component: CreatedRulesetPage,
});
const routeTree = rootRoute.addChildren([createPageRoute, createdRoute]);

function CreateRulesetStoryPage() {
  const router = useMemo(
    () =>
      createRouter({
        history: createMemoryHistory({ initialEntries: ['/rulesets/create'] }),
        routeTree,
      }),
    []
  );
  return <RouterProvider router={router} />;
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
  return (
    <RestartWorkerContext.Provider value={startWorker}>
      <ConvexTestWorkerContext.Provider value={{ client: state.client, identity }}>
        {children}
      </ConvexTestWorkerContext.Provider>
    </RestartWorkerContext.Provider>
  );
}

const rulesetsList = makeFunctionReference<'query', Record<string, never>, unknown[]>('rulesets:list');
const profileSession = makeFunctionReference<'query', Record<string, never>, { userId: string | null }>(
  'profiles:session'
);

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
            'Identities stayed separate, fetch was blocked, local HTTP completed, scheduled work ran, and rollback held'
          );
        }}
      >
        Run isolation checks
      </Button>
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
  const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 10_000 });
  await userEvent.type(name, createdRuleset.name);
  await userEvent.type(page.getByRole('textbox', { name: 'About' }), createdRuleset.about);
  await userEvent.click(page.getByRole('button', { name: 'Create' }));
  await expect(page.findByRole('heading', { name: `Created ${createdRuleset.slug}` })).resolves.toBeVisible();
  await expect(page.findByText(`Database contains ${createdRuleset.name}`)).resolves.toBeVisible();
  return page;
}

export const CreateResetAndCreateAgain = meta.story({
  play: async ({ canvasElement }) => {
    const page = await createThroughPage(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Reset database and create again' }));
    await createThroughPage(canvasElement);
  },
});

export const TwentyCleanWorkerResets = meta.story({
  render: () => <ResetStressPage />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Run 20 worker resets' }));
    await expect(
      page.findByText('Reset 20 of 20 completed with an empty rulesets table', {}, { timeout: 10_000 })
    ).resolves.toBeVisible();
  },
});

export const IdentitiesAndNetworkStayIsolated = meta.story({
  render: () => <IdentityAndNetworkProofPage />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Run isolation checks' }));
    await expect(
      page.findByText(
        'Identities stayed separate, fetch was blocked, local HTTP completed, scheduled work ran, and rollback held'
      )
    ).resolves.toBeVisible();
  },
});
