import type { StoryContext } from '@storybook/tanstack-react';
import { getFunctionName } from 'convex/server';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { mocked } from 'storybook/test';

import { api } from '../../../../convex/_generated/api';
import { db as applicationDb } from '../core';
import type { DatabaseDefinition } from './database';
import type { SeedReference, WorkerIdentity } from './protocol';
import type { ConvexStorybookWorker } from './runtime';
import {
  ConvexStorybookWorkerClient,
  ConvexStorybookWorkerContext,
  convexUseMutation,
  convexUsePaginatedQuery,
  convexUseQuery,
  convexUseQueries,
  useConvexStorybookMutation,
  useConvexStorybookPaginatedQuery,
  useConvexStorybookQuery,
  useConvexStorybookQueries,
} from './runtime';

type StorybookDatabaseSession = {
  client: ConvexStorybookWorkerClient;
  reset: () => Promise<ConvexStorybookWorkerClient>;
};

const StorybookDatabaseContext = createContext<StorybookDatabaseSession | null>(null);

/*
 * Booting a worker loads every Convex module and costs most of a second, while reseeding one costs a fraction of that.
 * So a retired worker waits here for the next story, which reseeds it with its own database.
 * Each story gets a fresh session on the worker and the last story's session is revoked, so a late call from it fails instead of reaching the next story's database.
 * Stories shown together, as on a docs page, each take a worker of their own.
 */
const idleWorkers: ConvexStorybookWorker[] = [];
const IDLE_WORKER_LIMIT = 2;

async function startWorker(database: DatabaseDefinition, signal?: AbortSignal) {
  const client = new ConvexStorybookWorkerClient(idleWorkers.shift());
  const abandoned = () => client.terminate();
  signal?.addEventListener('abort', abandoned, { once: true });
  try {
    signal?.throwIfAborted();
    await client.reset(database.create());
    signal?.throwIfAborted();
    return client;
  } catch (error) {
    client.terminate();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abandoned);
  }
}

/* Database startup and generated route addresses belong to setup, before an interaction's first assertion. */
export async function loadStorybookDatabase({
  parameters,
  args,
  abortSignal,
}: Pick<StoryContext, 'parameters' | 'args' | 'abortSignal'>) {
  const database = parameters.database as DatabaseDefinition | undefined;
  if (!database) {
    return {};
  }
  const client = await startWorker(database, abortSignal);
  const abandoned = () => client.terminate();
  abortSignal.addEventListener('abort', abandoned, { once: true });
  try {
    const path: unknown = args.path;
    const resolvedPath =
      typeof path === 'object' && path !== null && '$seedRef' in path
        ? await client.resolve(path as SeedReference)
        : undefined;
    abortSignal.throwIfAborted();
    return {
      storybookDatabase: {
        key: crypto.randomUUID(),
        database,
        client,
        path: resolvedPath,
        claim: () => abortSignal.removeEventListener('abort', abandoned),
      },
    };
  } catch (error) {
    abortSignal.removeEventListener('abort', abandoned);
    client.terminate();
    throw error;
  }
}

/* A worker still busy after this long, such as one stuck on an action that never answers, would stall the next story's reseed, so it is stopped instead. */
const RETIRE_IDLE_MS = 2000;

function retireWorker(client: ConvexStorybookWorkerClient | null) {
  if (!client) {
    return;
  }
  const worker = client.retire();
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), RETIRE_IDLE_MS));
  void Promise.race([worker.request({ operation: 'ping' }).then(() => true), timeout]).then(
    (idle) => {
      if (idle && worker.healthy && idleWorkers.length < IDLE_WORKER_LIMIT) {
        idleWorkers.push(worker);
      } else {
        worker.terminate();
      }
    },
    () => worker.terminate()
  );
}

export function StorybookDatabaseProvider({
  children,
  identity,
  prepared,
}: Readonly<{
  children: ReactNode;
  identity?: WorkerIdentity;
  prepared: NonNullable<Awaited<ReturnType<typeof loadStorybookDatabase>>['storybookDatabase']>;
}>) {
  const { database } = prepared;
  /* Bumped by every start and every unmount, so a startup that a newer one overtook retires its worker instead of replacing the newer database. */
  const generation = useRef(0);
  const [client, setClient] = useState(prepared.client);

  const reset = useCallback(async () => {
    generation.current += 1;
    const started = generation.current;
    const nextClient = await startWorker(database);
    if (started !== generation.current) {
      retireWorker(nextClient);
      throw new Error('The story stopped or restarted before this database started.');
    }
    setClient(nextClient);
    return nextClient;
  }, [database]);

  useEffect(() => {
    prepared.claim();
    return () => {
      generation.current += 1;
    };
  }, [prepared]);

  /* The previous client is retired only once the tree has moved off it, so no rendered query is left asking a worker that another story may already be reseeding. */
  useEffect(() => {
    return () => retireWorker(client);
  }, [client]);

  mocked(applicationDb.action).mockImplementation(((fn, args) =>
    client.action(fn, args, identity)) as typeof applicationDb.action);
  mocked(applicationDb.query).mockImplementation(((fn, args) =>
    client.query(fn, args, identity)) as typeof applicationDb.query);
  mocked(applicationDb.mutation).mockImplementation(((fn, args) =>
    client.mutation(fn, args, identity)) as typeof applicationDb.mutation);
  mocked(convexUseQuery).mockImplementation(useConvexStorybookQuery as typeof convexUseQuery);
  mocked(convexUseQueries).mockImplementation(useConvexStorybookQueries as typeof convexUseQueries);
  mocked(convexUseMutation).mockImplementation(useConvexStorybookMutation as typeof convexUseMutation);
  mocked(convexUsePaginatedQuery).mockImplementation(
    useConvexStorybookPaginatedQuery as typeof convexUsePaginatedQuery
  );

  return (
    <StorybookDatabaseContext.Provider value={{ client, reset }}>
      <ConvexStorybookWorkerContext.Provider value={{ client, identity }}>
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

/**
 * A story decorator that holds every Convex query unanswered, as a page sees an unreachable deployment.
 * Story decorators render inside the browser-local database, so this replaces the query it installs on each render.
 */
export function convexNeverAnswers(Story: ComponentType) {
  mocked(convexUseQuery).mockImplementation((() => undefined) as typeof convexUseQuery);
  mocked(convexUseQueries).mockImplementation((queries) =>
    Object.fromEntries(Object.keys(queries).map((key) => [key, undefined]))
  );
  return <Story />;
}

/**
 * A story decorator for Play's fixtures, which seat each faction under its slug rather than a catalogue id.
 * The seat's page address is that slug when the browser-local database holds a live faction there, and nothing otherwise.
 * Every other query stays with the database.
 */
export function seatFactionsResolve(Story: ComponentType) {
  const pageSlug = getFunctionName(api.factions.pageSlug);
  mocked(convexUseQuery).mockImplementation(((query, args) => {
    if (getFunctionName(query) !== pageSlug) {
      return useConvexStorybookQuery(query, args);
    }
    const { id } = args as { id: string };
    const holder = useConvexStorybookQuery(api.factions.slugTaken, { slug: id });
    return holder === undefined ? undefined : holder === 'live' ? id : null;
  }) as typeof convexUseQuery);
  return <Story />;
}
