import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { Suspense, use, useEffect, useMemo } from 'react';

import { useStorybookDatabaseClient } from '@db/storybook';
import type { SeedReference } from '@db/storybook';
import { ShellPageBackdrop } from '@app/shell/ShellStoryPage.stories.fixture';

import { AppErrorComponent } from '../router';
import { cloneApplicationRouteTree } from './routeTreeCopy';

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

/**
 * `history` is the router's history when a story walks it or reads the address it holds, as a reader's browser would.
 * It must hold `path`, and a story makes one per run in a loader, since a story's module runs once and its history must not carry over.
 * Without it the page runs from a fresh memory history at `path`.
 */
type StorybookPageProps = Readonly<{
  path: string;
  history?: RouterHistory;
  onResolved?: (pathname: string) => void;
}>;

function SeededPage({
  reference,
  ...props
}: Readonly<{ reference: SeedReference }> & Omit<StorybookPageProps, 'path'>) {
  const client = useStorybookDatabaseClient();
  return <RoutedPage path={use(client.resolve(reference))} {...props} />;
}

export function StorybookPage({ path, ...props }: StorybookPageProps) {
  const reference = seedReference(path);
  return reference ? (
    <Suspense fallback={<div role="status">Resolving the page address…</div>}>
      <SeededPage reference={reference} {...props} />
    </Suspense>
  ) : (
    <RoutedPage path={path} {...props} />
  );
}

function RoutedPage({ path, history, onResolved }: StorybookPageProps) {
  const router = useMemo(
    () =>
      createRouter({
        defaultErrorComponent: AppErrorComponent,
        history: history ?? createMemoryHistory({ initialEntries: [path] }),
        routeTree: cloneApplicationRouteTree(),
      }),
    [path, history]
  );

  useEffect(() => {
    const unsubscribe = router.subscribe('onResolved', ({ toLocation }) => onResolved?.(toLocation.pathname));
    const resolved = router.state.resolvedLocation;
    if (router.state.status === 'idle' && resolved) {
      onResolved?.(resolved.pathname);
    }
    return unsubscribe;
  }, [router, onResolved]);

  /* The document stylesheet belongs to the page for as long as the page is mounted, and to nothing
     after it: the root route's own import of it is stubbed under Storybook (.storybook/pageStylesheet.ts),
     so this is the only way it reaches a page story's document. */
  return (
    <ShellPageBackdrop>
      <RouterProvider router={router} />
    </ShellPageBackdrop>
  );
}
