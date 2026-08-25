import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type { AnyRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { storybookRoutes } from './-storybookRoutes';
import type { StorybookRouteKey } from './-storybookRoutes';
import { Route as AppRoute } from './_app';

function routeTreeFor(routeKey: StorybookRouteKey) {
  const entry = storybookRoutes[routeKey];
  const rootRoute = createRootRoute({ component: Outlet });
  rootRoute.init({ originalIndex: 0 });
  let parent: AnyRoute = rootRoute;

  if (entry.app) {
    const appRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_app',
      component: AppRoute.options.component,
      notFoundComponent: AppRoute.options.notFoundComponent,
    });
    appRoute.init({ originalIndex: 0 });
    rootRoute.addChildren([appRoute]);
    parent = appRoute;
  }

  /*
   * File routes receive their IDs when the generated tree initializes them. Initialize the real
   * route against the Storybook parent so its bound hooks read the same ID as the mounted clone.
   */
  entry.route.update({
    getParentRoute: () => parent,
    id: entry.path,
    path: entry.path,
  } as never);
  entry.route.init({ originalIndex: 0 });
  const leafRoute = createRoute({
    ...entry.route.options,
    getParentRoute: () => parent,
    id: undefined,
    path: entry.path,
  } as never);
  parent.addChildren([leafRoute]);

  return rootRoute;
}

export function StorybookPage({ path, routeKey }: Readonly<{ path: string; routeKey: StorybookRouteKey }>) {
  const router = useMemo(
    () =>
      createRouter({
        history: createMemoryHistory({ initialEntries: [path] }),
        routeTree: routeTreeFor(routeKey),
      }),
    [path, routeKey]
  );

  return <RouterProvider router={router} />;
}
