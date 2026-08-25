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

import { createdRuleset, createRulesetIdentity, createRulesetSeed } from './-create.stories.fixture';
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

function WithRestartableWorker({
  children,
  identity,
  seed,
}: Readonly<{ children: ReactNode; identity: WorkerIdentity; seed: SeedDocument[] }>) {
  const activeClient = useRef<ConvexTestWorkerClient | null>(null);
  const mounted = useRef(true);
  const [state, setState] = useState<WorkerState>({ status: 'loading' });

  const startWorker = useCallback(async () => {
    const nextClient = new ConvexTestWorkerClient();
    try {
      await nextClient.reset(seed);
    } catch (error) {
      nextClient.terminate();
      throw error;
    }
    if (!mounted.current) {
      nextClient.terminate();
      throw new Error('The story stopped before its replacement worker started.');
    }
    const previousClient = activeClient.current;
    await previousClient?.waitForIdle();
    activeClient.current = nextClient;
    setState({ status: 'success', client: nextClient });
    previousClient?.terminate();
    return nextClient;
  }, [seed]);

  useEffect(() => {
    mounted.current = true;
    void startWorker().catch((error: unknown) => {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      mounted.current = false;
      activeClient.current?.terminate();
      activeClient.current = null;
    };
  }, [startWorker]);

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

function IdentityAndNetworkProofPage() {
  const { client } = useContext(ConvexTestWorkerContext) ?? {};
  const [status, setStatus] = useState('Ready to check adjacent identities and the network guard');

  if (!client) {
    throw new Error('The story has no Convex worker client.');
  }

  return (
    <Stack p="xl">
      <Title order={1}>Worker isolation proof</Title>
      <Alert>{status}</Alert>
      <Button
        onClick={async () => {
          const [creator, observer, signedOut, networkMessage] = await Promise.all([
            client.query(profileSession, {}, createRulesetIdentity),
            client.query(profileSession, {}, { name: 'Storybook observer', subjectKey: 'observer' }),
            client.query(profileSession, {}),
            client.runNetworkProbe(),
          ]);
          if (!creator.userId || !observer.userId || creator.userId === observer.userId || signedOut.userId) {
            throw new Error('The worker did not keep its adjacent identities separate.');
          }
          if (networkMessage !== 'Convex Storybook workers cannot make network requests.') {
            throw new Error(`Unexpected network guard result: ${networkMessage}`);
          }
          setStatus('Two identities stayed separate, signed-out stayed empty, and fetch was blocked');
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
      page.findByText('Two identities stayed separate, signed-out stayed empty, and fetch was blocked')
    ).resolves.toBeVisible();
  },
});
