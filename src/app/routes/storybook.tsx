import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { AnyRoute } from '@tanstack/react-router';
import { Suspense, use, useMemo } from 'react';

import { useStorybookDatabaseClient } from '@db/storybook';
import type { SeedReference } from '@db/storybook';
import { ShellPageBackdrop } from '@app/shell/ShellStoryPage.stories.fixture';

import { AppErrorComponent } from '../router';
import { routeTree as applicationRouteTree } from '../routeTree.gen';

function cloneRoute(source: AnyRoute, parent: AnyRoute): AnyRoute {
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
  const route = createRoute({ ...options, ...location, getParentRoute: () => parent } as never);
  const children = Object.values(source.children ?? {}).map((child) => cloneRoute(child as AnyRoute, route));
  return children?.length ? route.addChildren(children) : route;
}

/* TanStack assigns a route tree to one router. Storybook can render stories concurrently, so each
   page receives a structural copy of the complete generated tree with the same route options and
   IDs. The production FileRoutes remain untouched and their bound hooks resolve through those IDs. */
function cloneApplicationRouteTree() {
  const {
    getParentRoute: _sourceParent,
    id: _id,
    path: _path,
    ...options
  } = applicationRouteTree.options as typeof applicationRouteTree.options & {
    id?: string;
    path?: string;
  };
  const root = createRootRoute(options as never);
  const children = Object.values(applicationRouteTree.children ?? {}).map((child) => cloneRoute(child, root));
  return children?.length ? root.addChildren(children) : root;
}

/**
 * A page meta's `beforeEach`.
 * The router runs from memory, but pages that read the browser hash see the preview frame, where the previous story left its last hash.
 * The frame takes this story's hash, or none, before the story renders.
 */
export function syncPreviewFrameHash({ args }: Readonly<{ args: { path?: string } }>) {
  const path = typeof args.path === 'string' ? args.path : '';
  const hashStart = path.indexOf('#');
  const hash = hashStart === -1 ? '' : path.slice(hashStart);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

/* A `refText` path carries a seed key whose generated id only the database knows; it resolves before the router starts. */
function seedReference(path: string): SeedReference | null {
  const candidate: unknown = path;
  return typeof candidate === 'object' && candidate !== null && '$seedRef' in candidate
    ? (candidate as SeedReference)
    : null;
}

function SeededPage({ reference }: Readonly<{ reference: SeedReference }>) {
  const client = useStorybookDatabaseClient();
  return <RoutedPage path={use(client.resolve(reference))} />;
}

export function StorybookPage({ path }: Readonly<{ path: string }>) {
  const reference = seedReference(path);
  return reference ? (
    <Suspense fallback={<div role="status">Resolving the page address…</div>}>
      <SeededPage reference={reference} />
    </Suspense>
  ) : (
    <RoutedPage path={path} />
  );
}

function RoutedPage({ path }: Readonly<{ path: string }>) {
  const router = useMemo(
    () =>
      createRouter({
        defaultErrorComponent: AppErrorComponent,
        history: createMemoryHistory({ initialEntries: [path] }),
        routeTree: cloneApplicationRouteTree(),
      }),
    [path]
  );

  /* The document stylesheet belongs to the page for as long as the page is mounted, and to nothing
     after it: the root route's own import of it is stubbed under Storybook (.storybook/pageStylesheet.ts),
     so this is the only way it reaches a page story's document. */
  return (
    <ShellPageBackdrop>
      <RouterProvider router={router} />
    </ShellPageBackdrop>
  );
}
