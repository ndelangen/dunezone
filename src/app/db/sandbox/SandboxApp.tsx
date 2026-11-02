import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { createMemoryHistory, createRouter, RouterProvider, useRouter } from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { enterSandbox } from '@db/core';
import { AppErrorComponent } from '@app/router';
import { cloneApplicationRouteTree } from '@app/routes/routeTreeCopy';

import type { DatabaseDefinition } from '../storybook/database';
import type { WorkerIdentity } from '../storybook/protocol';
import { ConvexStorybookWorkerClient } from '../storybook/runtime';
import { SandboxConvexClient } from './SandboxConvexClient';

/*
 * The whole site, running on an in-memory database in the browser: a creator tutorial's practice copy of Dune Zone (Norbert, 2026-11-02).
 * The real pages and the real Convex functions run as they do on the site, over rows seeded from `database`,
 * signed in as `identity`; nothing reaches the deployment, and Reset seeds the rows afresh.
 * Its router keeps its own history in memory, so its links move round the practice copy and leave the address bar alone.
 */

/** What the page around a sandbox can do with it. */
export type SandboxControls = Readonly<{
  /** The practice copy's own router, to read where it is or send it somewhere. */
  router: AnyRouter;
  /** Seeds the database afresh and opens `path`. */
  reset: (path: string) => Promise<void>;
}>;

/* Convex Auth reads its token from this store, which holds a signed-in session that only the sandbox ever sees. */
function signedInStorage() {
  const items = new Map<string, string>([
    ['__convexAuthJWT_httpssandboxinvalid', 'sandbox'],
    ['__convexAuthRefreshToken_httpssandboxinvalid', 'sandbox'],
  ]);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

/* Makes the router's preloads do nothing; returns what lets them run again, once. Links read their preload setting as they render, so it is the router's preload itself that waits. */
function holdPreloads(router: AnyRouter): () => void {
  const preloadRoute = router.preloadRoute;
  router.preloadRoute = async () => undefined;
  let held = true;
  return () => {
    if (held) {
      held = false;
      router.preloadRoute = preloadRoute;
    }
  };
}

async function seededBackend(database: DatabaseDefinition) {
  const backend = new ConvexStorybookWorkerClient();
  await backend.reset(database.create());
  return backend;
}

type Running = { client: SandboxConvexClient; router: AnyRouter; storage: ReturnType<typeof signedInStorage> };

type Start = Readonly<{
  database: DatabaseDefinition;
  identity: WorkerIdentity;
  path: string;
  onReady?: (controls: SandboxControls) => void;
}>;

/* The sandbox's backend for now: Reset swaps it for a freshly seeded one. */
type Backend = { current: ConvexStorybookWorkerClient };

/*
 * Opens a started backend as the practice copy: `db` reads it, the site's own router preloads nothing, and the practice
 * router opens on `path`. Returns the copy and what closes it again.
 */
function open(start: Start, backend: Backend, outer: AnyRouter) {
  const client = new SandboxConvexClient(backend.current, start.identity);
  /* Entered before the practice router exists, so its first loaders already read the sandbox. */
  /* Under Storybook `@db/core` is automocked and entering answers nothing: the story's own database serves the pages then. */
  const exit = enterSandbox(client.asConvexClient()) as (() => void) | undefined;
  /*
   * The site's own router preloads a page when a link is hovered, without a load event, so while the sandbox is open
   * it preloads nothing: its loaders would read the sandbox and cache practice rows for the real page.
   */
  const restorePreload = holdPreloads(outer);
  const router = createRouter({
    defaultErrorComponent: AppErrorComponent,
    history: createMemoryHistory({ initialEntries: [start.path] }),
    routeTree: cloneApplicationRouteTree({ withoutShell: true, withoutChrome: true }),
  });
  const controls: SandboxControls = {
    router,
    reset: async (next) => {
      const fresh = await seededBackend(start.database);
      const old = backend.current;
      backend.current = fresh;
      client.replaceBackend(fresh);
      old.terminate();
      await router.navigate({ to: next as never, replace: true });
    },
  };
  const leave = () => {
    exit?.();
    restorePreload();
  };
  return { running: { client, router, storage: signedInStorage() }, controls, leave };
}

/*
 * Starts a practice copy for one mount and returns what ends it. It never opens once the site's own router has started
 * loading another page, and that router leaving this page closes it, so no real page's loaders read the sandbox.
 * A copy that cannot start shows the page's error, not the loading screen forever.
 */
function startSandbox(start: Start, outer: AnyRouter, show: (update: () => Running) => void): () => void {
  let ended = false;
  let leave = () => undefined as void;
  let backend: Backend | null = null;
  let client: SandboxConvexClient | null = null;
  seededBackend(start.database).then(
    (started) => {
      backend = { current: started };
      if (ended) {
        started.terminate();
        return;
      }
      const opened = open(start, backend, outer);
      client = opened.running.client;
      leave = opened.leave;
      show(() => opened.running);
      start.onReady?.(opened.controls);
    },
    (error: unknown) => {
      if (!ended) {
        show(() => {
          throw error;
        });
      }
    }
  );
  const end = () => {
    ended = true;
    leave();
  };
  const unsubscribe = outer.subscribe('onBeforeLoad', ({ pathChanged }) => {
    if (pathChanged) {
      end();
    }
  });
  return () => {
    end();
    unsubscribe();
    void client?.close();
    backend?.current.terminate();
  };
}

export function SandboxApp({
  database,
  identity,
  path,
  onReady,
  loading,
}: Readonly<{
  database: DatabaseDefinition;
  identity: WorkerIdentity;
  /** The page the practice copy opens on. */
  path: string;
  onReady?: (controls: SandboxControls) => void;
  /** Shown while the database starts. */
  loading: ReactNode;
}>) {
  const outer = useRouter();
  const [running, setRunning] = useState<Running | null>(null);
  /* One sandbox per mount, from the props it mounted with: the page keys this component to start another. */
  const [start] = useState<Start>(() => ({ database, identity, path, onReady }));

  useEffect(() => startSandbox(start, outer, setRunning), [start, outer]);

  if (!running) {
    return loading;
  }
  return (
    <ConvexAuthProvider
      client={running.client.asConvexClient()}
      storage={running.storage}
      storageNamespace={running.client.address}
      shouldHandleCode={false}
      replaceURL={() => undefined}
    >
      <RouterProvider router={running.router} />
    </ConvexAuthProvider>
  );
}
