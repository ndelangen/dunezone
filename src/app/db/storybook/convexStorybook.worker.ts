/// <reference lib="webworker" />

import { AsyncLocalStorage } from 'node:async_hooks';

import { convexTest } from 'convex-test';
import { createFunctionHandle, makeFunctionReference } from 'convex/server';
import type { WithoutSystemFields } from 'convex/server';

import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';
import type { DatabaseWriter } from '../../../../convex/_generated/server';
import schema from '../../../../convex/schema';
import aggregateSchema from '../../../../node_modules/@convex-dev/aggregate/src/component/schema';
import migrationsSchema from '../../../../node_modules/@convex-dev/migrations/src/component/schema';
import type {
  ContextConformanceResult,
  ContextTraceEntry,
  SeedDocument,
  SeedDocumentFor,
  RollbackProbeResult,
  SchedulerProbeResult,
  WorkerIdentity,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

Object.assign(globalThis, { global: globalThis, process: { env: {} } });
const NativeDate = Date;
const STORYBOOK_NOW = Date.parse('2026-01-01T12:00:00.000Z');
class DeterministicStorybookDate extends NativeDate {
  constructor(
    ...args:
      | []
      | [value: string | number]
      | [
          year: number,
          monthIndex: number,
          date?: number,
          hours?: number,
          minutes?: number,
          seconds?: number,
          ms?: number,
        ]
  ) {
    if (args.length === 0) {
      super(STORYBOOK_NOW);
    } else if (args.length === 1) {
      super(args[0]);
    } else {
      super(...args);
    }
  }

  static override now() {
    return STORYBOOK_NOW;
  }
}
Object.defineProperty(globalThis, 'Date', {
  configurable: false,
  value: DeterministicStorybookDate,
  writable: false,
});
Object.defineProperty(globalThis, 'fetch', {
  configurable: false,
  value: () => Promise.reject(new Error('Convex Storybook workers cannot make network requests.')),
  writable: false,
});
Object.defineProperty(globalThis, 'Worker', {
  configurable: false,
  value: class DisabledStorybookSubworker {
    constructor() {
      throw new Error('Convex Storybook workers cannot start subworkers.');
    }
  },
  writable: false,
});

const modules = import.meta.glob([
  '../../../../convex/**/*.{ts,js}',
  '!../../../../convex/convex.config.ts',
  '!../../../../convex/**/*.d.ts',
  '!../../../../convex/**/*.test.ts',
  '!../../../../convex/**/*.test.fixture.ts',
  '!../../../../convex/**/*.stories.ts',
]);

const aggregateModules = import.meta.glob([
  '../../../../node_modules/@convex-dev/aggregate/src/component/**/*.{ts,js}',
  '!../../../../node_modules/@convex-dev/aggregate/src/component/convex.config.ts',
  '!../../../../node_modules/@convex-dev/aggregate/src/component/**/*.helpers.ts',
  '!../../../../node_modules/@convex-dev/aggregate/src/component/**/*.test.ts',
]);

const migrationsModules = import.meta.glob([
  '../../../../node_modules/@convex-dev/migrations/src/component/**/*.{ts,js}',
  '!../../../../node_modules/@convex-dev/migrations/src/component/convex.config.ts',
  '!../../../../node_modules/@convex-dev/migrations/src/component/**/*.test.ts',
]);

type TestWorld = ReturnType<typeof convexTest>;
type World = { test: TestWorld; references: Map<string, string> };
type WorldRequest = Exclude<
  WorkerRequest,
  { operation: 'contextConformance' | 'networkProbe' | 'ping' | 'reset' | 'subworkerProbe' }
>;

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
  world.test.registerComponent('migrations', migrationsSchema, migrationsModules);
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

async function runNetworkProbe() {
  try {
    await fetch('https://example.com');
    throw new Error('The worker unexpectedly completed a network request.');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function runSubworkerProbe() {
  try {
    const worker = new Worker(new URL('./protocol.ts', import.meta.url), { type: 'module' });
    worker.terminate();
    return 'The Convex Storybook worker started a subworker.';
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

type ExplicitFrame = Readonly<{
  auth: string | null;
  componentPath: string;
  depth: number;
  udfPath: string;
  world: string;
}>;

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function nextMessage() {
  return new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port2.onmessage = () => {
      port1.close();
      port2.close();
      resolve();
    };
    port1.postMessage(null);
  });
}

function traceContext(trace: ContextTraceEntry[], step: string, expected: string, actual?: string) {
  trace.push({ actual: actual ?? null, expected, step });
}

async function runAmbientContextBaseline() {
  const context = new AsyncLocalStorage<string>();
  const trace: ContextTraceEntry[] = [];
  const component = async (name: string, milliseconds: number) => {
    return await context.run(name, async () => {
      traceContext(trace, `${name}:start`, name, context.getStore());
      await delay(milliseconds);
      traceContext(trace, `${name}:resume`, name, context.getStore());
      return context.getStore() ?? null;
    });
  };

  await context.run('root', async () => {
    await Promise.all([component('statistics', 5), component('profileDiscovery', 15)]);
    traceContext(trace, 'root:after', 'root', context.getStore());
  });
  return { mismatches: trace.filter(({ actual, expected }) => actual !== expected).length, trace };
}

function childFrame(parent: ExplicitFrame, componentPath: string, udfPath: string): ExplicitFrame {
  return Object.freeze({
    auth: componentPath === parent.componentPath ? parent.auth : null,
    componentPath,
    depth: parent.depth + 1,
    udfPath,
    world: parent.world,
  });
}

async function resumeExplicitFrame(frame: ExplicitFrame, milliseconds: number) {
  await Promise.resolve();
  await delay(milliseconds);
  await nextMessage();
  await import('./protocol');
  return frame;
}

async function runExplicitFrameBaseline() {
  let mismatches = 0;
  const iterations = 100;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const root = Object.freeze({
      auth: `identity-${iteration}`,
      componentPath: '',
      depth: 0,
      udfPath: 'root:probe',
      world: `world-${iteration}`,
    });
    const statistics = childFrame(root, 'statistics', 'public:probe');
    const discovery = childFrame(root, 'profileDiscovery', 'public:probe');
    const [statisticsAfter, discoveryAfter] = await Promise.all([
      resumeExplicitFrame(statistics, iteration % 3),
      resumeExplicitFrame(discovery, (iteration + 1) % 3),
    ]);
    const returnedRoot = await resumeExplicitFrame(root, iteration % 2);
    const expected = [statistics, discovery, root];
    const actual = [statisticsAfter, discoveryAfter, returnedRoot];
    mismatches += actual.filter((frame, index) => frame !== expected[index]).length;
    const expectedAuth = [null, null, root.auth];
    const actualAuth = [statisticsAfter.auth, discoveryAfter.auth, returnedRoot.auth];
    mismatches += Number(actualAuth.some((auth, index) => auth !== expectedAuth[index]));
  }
  return {
    iterations,
    mismatches,
    sources: ['native promise', 'setTimeout', 'MessageChannel', 'dynamic import'],
  };
}

async function runConvexHelperGate() {
  const reference = makeFunctionReference<'query'>('rulesets:list');
  try {
    const helperWorld = await createWorld([]);
    const handle = await helperWorld.test.run(async () => {
      await Promise.resolve();
      return await createFunctionHandle(reference);
    });
    return {
      error: '',
      handle,
      status: 'supported' as const,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      handle: null,
      status: 'blocked' as const,
    };
  }
}

async function runContextConformance(): Promise<ContextConformanceResult> {
  const dateParts = [2020, 4, 3, 2, 1, 0, 9] as const;
  return {
    date: {
      deterministicDefault: new Date().getTime() === STORYBOOK_NOW,
      multiArgumentMatchesNative: new Date(...dateParts).getTime() === new NativeDate(...dateParts).getTime(),
    },
    ambient: await runAmbientContextBaseline(),
    explicit: await runExplicitFrameBaseline(),
    convexHelper: await runConvexHelperGate(),
  };
}

let world = createWorld([]);
const unhandledRequest = Symbol('unhandledRequest');

async function handleLifecycleRequest(request: WorkerRequest): Promise<unknown | typeof unhandledRequest> {
  if (request.operation === 'ping') {
    return null;
  }
  if (request.operation === 'reset') {
    world = createWorld(request.seed);
    await world;
    return null;
  }
  if (request.operation === 'networkProbe') {
    return await runNetworkProbe();
  }
  if (request.operation === 'subworkerProbe') {
    return runSubworkerProbe();
  }
  if (request.operation === 'contextConformance') {
    return await runContextConformance();
  }
  return unhandledRequest;
}

async function handleWorldRequest(request: WorldRequest, currentWorld: World): Promise<unknown> {
  if (request.operation === 'httpProbe') {
    return await runHttpProbe(currentWorld);
  }
  if (request.operation === 'schedulerProbe') {
    return await runSchedulerProbe(currentWorld);
  }
  if (request.operation === 'rollbackProbe') {
    return await runRollbackProbe();
  }
  if (request.operation === 'mutation') {
    return await mutateWorld(currentWorld, request.name, request.args, request.identity);
  }
  return await queryWorld(currentWorld, request.name, request.args, request.identity);
}

async function handleRequest(request: WorkerRequest): Promise<unknown> {
  const lifecycleResult = await handleLifecycleRequest(request);
  if (lifecycleResult !== unhandledRequest) {
    return lifecycleResult;
  }
  return await handleWorldRequest(request as WorldRequest, await world);
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
