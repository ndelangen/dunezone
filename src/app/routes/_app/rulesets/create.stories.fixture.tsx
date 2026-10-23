import {
  createMemoryHistory,
  createRootRoute,
  createRoute as createStoryRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useMemo } from 'react';

import { useStorybookDatabaseReset } from '@db/storybook';

import { Route as RulesetDetailRoute } from './$rulesetSlug/index';
import { Route } from './create.route';

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

export function CreateRulesetStoryPage() {
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
