/// <reference lib="webworker" />

import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import type { WithoutSystemFields } from 'convex/server';

import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';
import type { DatabaseWriter } from '../../../../convex/_generated/server';
import schema from '../../../../convex/schema';
import aggregateSchema from '../../../../node_modules/@convex-dev/aggregate/src/component/schema';
import type {
  SeedDocument,
  SeedDocumentFor,
  RollbackProbeResult,
  SchedulerProbeResult,
  WorkerIdentity,
  WorkerRequest,
  WorkerResponse,
} from './convexTestProtocol';

Object.assign(globalThis, { global: globalThis, process: { env: {} } });
Object.defineProperty(globalThis, 'fetch', {
  configurable: false,
  value: () => Promise.reject(new Error('Convex Storybook workers cannot make network requests.')),
  writable: false,
});

const modules = import.meta.glob([
  '../../../../convex/**/*.{ts,js}',
  '!../../../../convex/convex.config.ts',
  '!../../../../convex/**/*.d.ts',
  '!../../../../convex/**/*.test.ts',
  '!../../../../convex/**/*.stories.ts',
]);

const aggregateModules = import.meta.glob([
  '../../../../node_modules/@convex-dev/aggregate/src/component/**/*.{ts,js}',
  '!../../../../node_modules/@convex-dev/aggregate/src/component/convex.config.ts',
  '!../../../../node_modules/@convex-dev/aggregate/src/component/**/*.helpers.ts',
  '!../../../../node_modules/@convex-dev/aggregate/src/component/**/*.test.ts',
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
  world.test.registerComponent('statistics', aggregateSchema, aggregateModules);
  world.test.registerComponent('profileActivity', aggregateSchema, aggregateModules);
  world.test.registerComponent('profileDiscovery', aggregateSchema, aggregateModules);
  await insertDocuments(world, seed);
  return world;
}

function clientFor(world: World, identity?: WorkerIdentity) {
  if (!identity) {
    return world.test;
  }
  const subject = world.references.get(identity.subjectKey);
  if (!subject) {
    throw new Error(`Unknown identity seed reference: ${identity.subjectKey}`);
  }
  return world.test.withIdentity({ subject, name: identity.name });
}

async function queryWorld(world: World, name: string, args: unknown, identity?: WorkerIdentity) {
  const query = makeFunctionReference<'query', Record<string, unknown>, unknown>(name);
  return await clientFor(world, identity).query(query, args as Record<string, unknown>);
}

async function mutateWorld(world: World, name: string, args: unknown, identity?: WorkerIdentity) {
  const mutation = makeFunctionReference<'mutation', Record<string, unknown>, unknown>(name);
  return await clientFor(world, identity).mutation(mutation, args as Record<string, unknown>);
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

async function runNetworkProbe() {
  try {
    await fetch('https://example.com');
    throw new Error('The worker unexpectedly completed a network request.');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function runHttpProbe(world: World) {
  const response = await world.test.fetch('/asset-publishing/render', {
    headers: { Authorization: 'Bearer missing-story-job' },
  });
  return { body: await response.json(), status: response.status };
}

async function runSchedulerProbe(world: World): Promise<SchedulerProbeResult> {
  await mutateWorld(world, 'statistics:rebuild', {});
  await world.test.finishAllScheduledFunctions(() => undefined);
  const after = (await queryWorld(world, 'statistics:getGlobalTotals', {})) as SchedulerProbeResult['after'];
  return { after };
}

async function runRollbackProbe(): Promise<RollbackProbeResult> {
  const isolated = await createWorld([]);
  let error = '';
  try {
    await isolated.test.run(async (ctx) => {
      await ctx.db.insert('users', { name: 'This user must roll back' });
      throw new Error('Intentional rollback probe');
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const usersAfterFailure = await isolated.test.run(async (ctx) => (await ctx.db.query('users').collect()).length);
  return { error, usersAfterFailure };
}

let world = createWorld([]);

async function handleRequest(request: WorkerRequest): Promise<unknown> {
  if (request.operation === 'ping') {
    return null;
  }
  if (request.operation === 'reset') {
    world = createWorld(request.seed);
    await world;
    return null;
  }
  if (request.operation === 'concurrency') {
    return await runConcurrencyProbe(request);
  }
  if (request.operation === 'networkProbe') {
    return await runNetworkProbe();
  }

  const currentWorld = await world;
  if (request.operation === 'httpProbe') {
    return await runHttpProbe(currentWorld);
  }
  if (request.operation === 'schedulerProbe') {
    return await runSchedulerProbe(currentWorld);
  }
  if (request.operation === 'rollbackProbe') {
    return await runRollbackProbe();
  }
  if (request.operation === 'insert') {
    await insertDocuments(currentWorld, request.documents);
    return null;
  }
  if (request.operation === 'mutation') {
    return await mutateWorld(currentWorld, request.name, request.args, request.identity);
  }
  return await queryWorld(currentWorld, request.name, request.args, request.identity);
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
