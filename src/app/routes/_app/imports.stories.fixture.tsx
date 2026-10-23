import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useMemo } from 'react';

import { Route } from './imports.route';

function ActualPage() {
  const Page = Route.options.component;
  if (!Page) {
    throw new Error('The import route has no page component.');
  }
  return <Page />;
}

const rootRoute = createRootRoute({ component: Outlet });
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: '_app', component: Outlet });
const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/imports',
  validateSearch: Route.options.validateSearch,
  component: ActualPage,
});
const routeTree = rootRoute.addChildren([appRoute.addChildren([importRoute])]);

export function ImportStoryPage() {
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ['/imports?ruleset=classicrules&group=arrakeen-rules-council'],
        }),
      }),
    []
  );
  return <RouterProvider router={router} />;
}
