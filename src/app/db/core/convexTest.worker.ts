/// <reference lib="webworker" />

import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import type { WithoutSystemFields } from 'convex/server';

import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';
import type { DatabaseWriter } from '../../../../convex/_generated/server';
import schema from '../../../../convex/schema';
import type { SeedDocument, SeedDocumentFor, WorkerRequest, WorkerResponse } from './convexTestProtocol';

Object.assign(globalThis, { global: globalThis, process: { env: {} } });

const modules = import.meta.glob([
  '../../../../convex/**/*.{ts,js}',
  '!../../../../convex/convex.config.ts',
  '!../../../../convex/**/*.d.ts',
  '!../../../../convex/**/*.test.ts',
  '!../../../../convex/**/*.stories.ts',
]);

type TestWorld = ReturnType<typeof convexTest>;
type World = { test: TestWorld; references: Map<string, string> };

function resolveSeedObject(value: Record<string, unknown>, references: Map<string, string>) {
  if (typeof value.$seedRef === 'string') {
    const resolved = references.get(value.$seedRef);
    if (!resolved) {
      throw new Error(`Unknown seed reference: ${value.$seedRef}`);
    }
    return resolved;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSeedValue(item, references)]));
}

function resolveSeedValue(value: unknown, references: Map<string, string>): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveSeedValue(item, references));
  }
  if (value instanceof ArrayBuffer) {
    return value;
  }
  return resolveSeedObject(value as Record<string, unknown>, references);
}

async function insertDocument<TableName extends TableNames>(
  db: DatabaseWriter,
  document: SeedDocumentFor<TableName>,
  references: Map<string, string>
) {
  const value = resolveSeedValue(document.value, references) as WithoutSystemFields<Doc<TableName>>;
  return await db.insert(document.table, value);
}

async function insertDocuments(world: World, documents: SeedDocument[], delay = 0) {
  await world.test.run(async (ctx) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    for (const document of documents) {
      const id = await insertDocument(ctx.db, document, world.references);
      if (document.key) {
        world.references.set(document.key, id);
      }
    }
  });
}

async function createWorld(seed: SeedDocument[]): Promise<World> {
  const world = { test: convexTest(schema, modules), references: new Map<string, string>() };
  await insertDocuments(world, seed);
  return world;
}

async function queryWorld(world: World, name: string, args: unknown) {
  const query = makeFunctionReference<'query', Record<string, unknown>, unknown>(name);
  return await world.test.query(query, args as Record<string, unknown>);
}

async function runConcurrencyProbe(request: Extract<WorkerRequest, { operation: 'concurrency' }>) {
  const first = await createWorld([]);
  const second = await createWorld([]);
  await Promise.all([insertDocuments(first, request.first, 5), insertDocuments(second, request.second, 25)]);
  return await Promise.all([
    queryWorld(first, request.name, request.args),
    queryWorld(second, request.name, request.args),
  ]);
}

let world = createWorld([]);

async function handleRequest(request: WorkerRequest): Promise<unknown> {
  if (request.operation === 'reset') {
    world = createWorld(request.seed);
    await world;
    return null;
  }
  if (request.operation === 'concurrency') {
    return await runConcurrencyProbe(request);
  }

  const currentWorld = await world;
  if (request.operation === 'insert') {
    await insertDocuments(currentWorld, request.documents);
    return null;
  }
  return await queryWorld(currentWorld, request.name, request.args);
}

let lane = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  if (event.origin && event.origin !== self.location.origin) {
    return;
  }
  const request = event.data;
  lane = lane.then(async () => {
    let response: WorkerResponse;
    try {
      response = { id: request.id, ok: true, result: await handleRequest(request) };
    } catch (error) {
      response = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error),
      };
    }
    self.postMessage(response);
  });
});
