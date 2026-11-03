import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import type { AnyRoute } from '@tanstack/react-router';

import { routeTree as applicationRouteTree } from '../routeTree.gen';

type CopyOptions = {
  /** Leaves out the root's document shell, for a copy rendered inside a page that already has one. */
  withoutShell?: boolean;
  /** Leaves out the site's header and footer, for a copy shown inside a page of the site, which already shows them. */
  withoutChrome?: boolean;
};

function cloneRoute(source: AnyRoute, parent: AnyRoute, copy: CopyOptions): AnyRoute {
  const {
    getParentRoute: _sourceParent,
    id,
    path,
    ...options
  } = source.options as typeof source.options & {
    id?: string;
    path?: string;
  };
  const location = path === undefined ? { id } : { path };
  const chrome = copy.withoutChrome && id === '/_app' ? { component: Outlet } : {};
  const route = createRoute({ ...options, ...chrome, ...location, getParentRoute: () => parent } as never);
  const children = Object.values(source.children ?? {}).map((child) => cloneRoute(child as AnyRoute, route, copy));
  return children?.length ? route.addChildren(children) : route;
}

/* TanStack assigns a route tree to one router. Storybook can render stories concurrently, so each
   page receives a structural copy of the complete generated tree with the same route options and
   IDs. The production FileRoutes remain untouched and their bound hooks resolve through those IDs. */
export function cloneApplicationRouteTree(copy: CopyOptions = {}) {
  const {
    getParentRoute: _sourceParent,
    id: _id,
    path: _path,
    ...options
  } = applicationRouteTree.options as typeof applicationRouteTree.options & {
    id?: string;
    path?: string;
  };
  /* A copy rendered inside a page, as a sandbox is, leaves out the root's document shell: the page already has one. */
  const { shellComponent: _shell, ...embedded } = options as typeof options & { shellComponent?: unknown };
  const root = createRootRoute((copy.withoutShell ? embedded : options) as never);
  const children = Object.values(applicationRouteTree.children ?? {}).map((child) => cloneRoute(child, root, copy));
  return children?.length ? root.addChildren(children) : root;
}
