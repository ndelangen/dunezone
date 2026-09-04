import preview from '@sb/preview';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute as createStoryRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { db, useStorybookDatabaseReset } from '@db/storybook';

import { Route as RulesetDetailRoute } from './$rulesetSlug/index';
import { Route } from './create';

const createdRuleset = {
  name: 'WorkerCreatedRuleset',
  about: 'This ruleset was created by the real page and mutation inside an isolated Storybook database.',
};

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
  const resetDatabase = useStorybookDatabaseReset();
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
        data-storybook-database-reset
        onClick={async () => {
          await resetDatabase();
          await router.navigate({ to: '/rulesets/create' });
        }}
      >
        Reset the story database
      </button>
    </>
  );
}

const meta = preview.meta({
  title: 'Rulesets/Create',
  component: CreateRulesetStoryPage,
  parameters: {
    layout: 'fullscreen',
    database: db((baseline) => baseline),
  },
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

export const Authenticated = meta.story({
  play: async ({ canvasElement }) => {
    const page = await createThroughPage(canvasElement);
    const reset = canvasElement.ownerDocument.querySelector<HTMLButtonElement>('[data-storybook-database-reset]');
    if (!reset) {
      throw new Error('The story database reset control is missing.');
    }
    reset.click();
    await expect(page.findByRole('heading', { name: 'Create ruleset' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/* A name the shared schema rejects is a field error and a disabled button, never a thrown parse in the console. */
export const NameWithSpace = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.type(name, 'Test Ruleset');
    await userEvent.type(page.getByRole('textbox', { name: 'About' }), createdRuleset.about);
    expect(name).toHaveAccessibleDescription(/only contain letters and numbers/);
    expect(page.getByRole('button', { name: 'Create' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'TestRuleset');
    expect(page.getByRole('button', { name: 'Create' })).toBeEnabled();
  },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Create ruleset' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* The gate frame, not the form: the settled signed-out answer must not leave the editor up. */
    expect(page.queryByRole('textbox', { name: 'Name' })).toBeNull();
  },
});
