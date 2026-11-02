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

async function seededBackend(database: DatabaseDefinition) {
  const backend = new ConvexStorybookWorkerClient();
  await backend.reset(database.create());
  return backend;
}

type Running = { client: SandboxConvexClient; router: AnyRouter; storage: ReturnType<typeof signedInStorage> };

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

  useEffect(() => {
    let cancelled = false;
    let leave = () => undefined as void;
    let backend: ConvexStorybookWorkerClient | null = null;
    let client: SandboxConvexClient | null = null;
    void seededBackend(database).then((started) => {
      backend = started;
      if (cancelled) {
        started.terminate();
        return;
      }
      client = new SandboxConvexClient(started, identity);
      /* Entered before the practice router exists, so its first loaders already read the sandbox. */
      /* Under Storybook `@db/core` is automocked and entering answers nothing: the story's own database serves the pages then. */
      const exit = enterSandbox(client.asConvexClient()) as (() => void) | undefined;
      leave = () => exit?.();
      const router = createRouter({
        defaultErrorComponent: AppErrorComponent,
        history: createMemoryHistory({ initialEntries: [path] }),
        routeTree: cloneApplicationRouteTree({ withoutShell: true, withoutChrome: true }),
      });
      const sandbox = client;
      setRunning({ client: sandbox, router, storage: signedInStorage() });
      onReady?.({
        router,
        reset: async (next) => {
          const fresh = await seededBackend(database);
          const old = backend;
          backend = fresh;
          sandbox.replaceBackend(fresh);
          old?.terminate();
          await router.navigate({ to: next as never, replace: true });
        },
      });
    });
    /* The site's own router leaving this page must not run its next page's loaders against the sandbox. */
    const unsubscribe = outer.subscribe('onBeforeLoad', () => leave());
    return () => {
      cancelled = true;
      unsubscribe();
      leave();
      void client?.close();
      backend?.terminate();
    };
    /* One sandbox per mount: the page keys this component to start another. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
