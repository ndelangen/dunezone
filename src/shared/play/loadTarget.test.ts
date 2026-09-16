import { afterEach, expect, test, vi } from 'vitest';

import {
  hostedActivation,
  hostedCellSchema,
  hostedLoadIdentity,
  hostedTargetSchema,
  requireHostedRun,
} from './loadTarget';

const target = hostedTargetSchema.parse({
  project: 'norbert-de-langen:dunezone-play-load',
  reference: 'dev/native',
  backendName: 'isolated-load-1105',
  backendOrigin: 'https://isolated-load-1105.eu-west-1.convex.cloud',
  applicationOrigin: 'https://dunezone-play-load-native.ndelangen.workers.dev',
  gameWorker: 'dunezone-game-load-native',
  namespaceId: '1'.repeat(32),
  sourceRevision: '2'.repeat(40),
});
const run = { runId: '3'.repeat(32), startsAt: 1000, expiresAt: 121_000 };
const environment = {
  CONVEX_CLOUD_URL: target.backendOrigin,
  SITE_URL: target.applicationOrigin,
  IS_TEST: 'true',
  E2E_LOCAL_AUTH: 'true',
  PLAY_LOAD_RUN: JSON.stringify(run),
};
afterEach(() => vi.useRealTimers());

test('the hosted target rejects application storage and mismatched deployment origins', () => {
  for (const change of [
    { applicationOrigin: 'https://dune.zone' },
    { gameWorker: 'dunezone-game' },
    { namespaceId: '3163dfec12ff4ab0a3887f8aaef457bd' },
    {
      backendName: 'exuberant-finch-263',
      backendOrigin: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
    },
    {
      backendName: 'tame-raccoon-541',
      backendOrigin: 'https://tame-raccoon-541.eu-west-1.convex.cloud',
    },
    { backendOrigin: 'https://another-backend-123.eu-west-1.convex.cloud' },
    { project: 'norbert-de-langen:dunezone' },
  ]) {
    expect(hostedTargetSchema.safeParse({ ...target, ...change }).success).toBe(false);
  }
});

test('the synthetic Auth guard accepts only its fixed roster during the matching run', () => {
  vi.useFakeTimers();
  vi.setSystemTime(2000);
  const params = {
    email: `load-37-${run.runId}@example.invalid`,
    password: '4'.repeat(48),
    flow: 'signUp',
  };
  expect(
    hostedLoadIdentity(target, environment, {
      ...params,
      name: 'Ignored client data',
    })
  ).toEqual({
    email: params.email,
  });
  expect(() =>
    hostedLoadIdentity(target, environment, {
      ...params,
      email: `load-38-${run.runId}@example.invalid`,
    })
  ).toThrow('fixed synthetic');
  expect(() =>
    hostedLoadIdentity(target, environment, {
      ...params,
      password: '4'.repeat(129),
    })
  ).toThrow();
  expect(() =>
    requireHostedRun(target, {
      ...environment,
      CONVEX_CLOUD_URL: 'https://dune.zone',
    })
  ).toThrow();
  vi.setSystemTime(run.expiresAt);
  expect(() => hostedLoadIdentity(target, environment, params)).toThrow('inactive');
});

const ceilings = { messages: 100_000, incomingBytes: 16 * 1024 * 1024, requests: 1000, connections: 44 };

test('activation refuses malformed or unbounded configuration while retaining expired cleanup access', () => {
  for (const value of [
    undefined,
    '{',
    'null',
    JSON.stringify({ gameId: 'game', run }),
    JSON.stringify({ gameId: '../other', run, ceilings }),
    JSON.stringify({ gameId: 'game', run: { ...run, expiresAt: run.startsAt + 1_200_001 }, ceilings }),
    JSON.stringify({ gameId: 'game', run, ceilings: { ...ceilings, connections: 100 } }),
    JSON.stringify({ gameId: 'game', run, ceilings: { ...ceilings, messages: 120_001 } }),
    JSON.stringify({ gameId: 'game', run, ceilings: { ...ceilings, incomingBytes: 32 * 1024 * 1024 + 1 } }),
    JSON.stringify({ gameId: 'game', run, ceilings: { ...ceilings, requests: 1001 } }),
  ]) {
    expect(hostedActivation(value)).toBeNull();
  }
  const activation = { gameId: 'game', run, ceilings };
  expect(hostedActivation(JSON.stringify(activation))).toEqual(activation);
});

test('an approved cell names its case, bounds and approval, and browser cells keep compression', () => {
  const cell = {
    case: 'steady',
    repetition: 2,
    compression: 'on',
    maxApplicationBytes: 1_073_741_824,
    ceilings,
    approval: 'https://github.com/ndelangen/dunezone/issues/1164#issuecomment-1',
  };
  expect(hostedCellSchema.parse(cell)).toEqual(cell);
  for (const change of [
    { case: 'browser', compression: 'off' },
    { repetition: 4 },
    { maxApplicationBytes: 0 },
    { approval: 'not a link' },
    { ceilings: { ...ceilings, messages: 120_001 } },
    { extra: true },
  ]) {
    expect(hostedCellSchema.safeParse({ ...cell, ...change }).success).toBe(false);
  }
});

test('the hosted guard reads Convex environment properties without requiring key enumeration', () => {
  vi.useFakeTimers();
  vi.setSystemTime(2000);
  const convexEnvironment = new Proxy({} as Record<string, string | undefined>, {
    get: (_target, name: string) => environment[name as keyof typeof environment],
  });
  expect('SITE_URL' in convexEnvironment).toBe(false);
  expect(requireHostedRun(target, convexEnvironment)).toEqual(run);
});
