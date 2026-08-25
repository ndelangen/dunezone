import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { mocked } from 'storybook/test';

import { db as applicationDb } from '../core';
import type { DatabaseDefinition } from './database';
import type { WorkerIdentity } from './protocol';
import {
  ConvexStorybookWorkerClient,
  ConvexStorybookWorkerContext,
  convexUseMutation,
  convexUseQuery,
  useConvexStorybookMutation,
  useConvexStorybookQuery,
} from './runtime';

type WorkerState =
  | { status: 'loading' }
  | { status: 'success'; client: ConvexStorybookWorkerClient }
  | { status: 'error'; message: string };

type StorybookDatabaseSession = {
  client: ConvexStorybookWorkerClient;
  reset: () => Promise<ConvexStorybookWorkerClient>;
};

const StorybookDatabaseContext = createContext<StorybookDatabaseSession | null>(null);

async function startWorker(database: DatabaseDefinition) {
  const client = new ConvexStorybookWorkerClient();
  try {
    await client.reset(database.create());
    return client;
  } catch (error) {
    client.terminate();
    throw error;
  }
}

async function retireWorker(client: ConvexStorybookWorkerClient | null) {
  if (!client) {
    return;
  }
  await client.waitForIdle();
  client.terminate();
}

export function StorybookDatabaseProvider({
  children,
  database,
  identity,
}: Readonly<{
  children: ReactNode;
  database: DatabaseDefinition;
  identity?: WorkerIdentity;
}>) {
  const activeClient = useRef<ConvexStorybookWorkerClient | null>(null);
  const mounted = useRef(true);
  const [state, setState] = useState<WorkerState>({ status: 'loading' });

  const reset = useCallback(async () => {
    const nextClient = await startWorker(database);
    if (!mounted.current) {
      nextClient.terminate();
      throw new Error('The story stopped before its replacement database started.');
    }
    await retireWorker(activeClient.current);
    activeClient.current = nextClient;
    setState({ status: 'success', client: nextClient });
    return nextClient;
  }, [database]);

  useEffect(() => {
    mounted.current = true;
    void reset().catch((error: unknown) => {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      mounted.current = false;
      activeClient.current?.terminate();
      activeClient.current = null;
    };
  }, [reset]);

  if (state.status === 'loading') {
    return <div role="status">Starting the browser-local Convex database…</div>;
  }
  if (state.status === 'error') {
    return <div role="alert">{state.message}</div>;
  }

  mocked(applicationDb.query).mockImplementation(((fn, args) =>
    state.client.query(fn, args, identity)) as typeof applicationDb.query);
  mocked(applicationDb.mutation).mockImplementation(((fn, args) =>
    state.client.mutation(fn, args, identity)) as typeof applicationDb.mutation);
  mocked(convexUseQuery).mockImplementation(useConvexStorybookQuery as typeof convexUseQuery);
  mocked(convexUseMutation).mockImplementation(useConvexStorybookMutation as typeof convexUseMutation);

  return (
    <StorybookDatabaseContext.Provider value={{ client: state.client, reset }}>
      <ConvexStorybookWorkerContext.Provider value={{ client: state.client, identity }}>
        {children}
      </ConvexStorybookWorkerContext.Provider>
    </StorybookDatabaseContext.Provider>
  );
}

export function useStorybookDatabaseReset() {
  const session = useContext(StorybookDatabaseContext);
  if (!session) {
    throw new Error('The story has no browser-local Convex database.');
  }
  return session.reset;
}

export function useStorybookDatabaseClient() {
  const session = useContext(StorybookDatabaseContext);
  if (!session) {
    throw new Error('The story has no browser-local Convex database.');
  }
  return session.client;
}
