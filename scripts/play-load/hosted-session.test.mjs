import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { openHostedSession } from './hosted-session.mjs';

let directory;
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

test('hosted preflight rejects the wrong credential scope before network access and verifies cleanup', async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'hosted-session-'));
  const filename = path.join(directory, 'run.json');
  const target = {
    project: 'norbert-de-langen:dunezone-play-load',
    reference: 'dev/native',
    backendName: 'isolated-load-1105',
    backendOrigin: 'https://isolated-load-1105.eu-west-1.convex.cloud',
    applicationOrigin: 'https://dunezone-play-load-native.ndelangen.workers.dev',
    gameWorker: 'dunezone-game-load-native',
    namespaceId: '1'.repeat(32),
    sourceRevision: '2'.repeat(40),
  };
  const startsAt = Date.now();
  const run = {
    runId: '3'.repeat(32),
    startsAt,
    expiresAt: startsAt + 600_000,
  };
  const game = {
    gameId: 'fixture-game',
    secret: '4'.repeat(64),
    attemptId: '5'.repeat(64),
    expiresAt: startsAt + 60_000,
  };
  const cell = {
    profile: 'stacked',
    case: 'steady',
    repetition: 2,
    compression: 'on',
    maxApplicationBytes: 1_073_741_824,
    ceilings: { messages: 100_000, incomingBytes: 16 * 1024 * 1024, requests: 1000, connections: 44 },
    approval: 'https://github.com/ndelangen/dunezone/issues/1164#issuecomment-1',
  };
  await writeFile(
    filename,
    JSON.stringify({
      target,
      run,
      game,
      cell,
      controlSecret: '6'.repeat(64),
    }),
    {
      mode: 0o600,
    }
  );
  const values = {
    origin: target.applicationOrigin,
    profile: 'stacked',
    case: 'steady',
    repetition: '2',
    compression: 'on',
    'profile-cpu': false,
  };
  let ceilings = cell.ceilings;
  let activatedCell = { profile: 'stacked', case: 'steady', repetition: 2, compression: 'on' };
  const fetch = vi.fn((_url, { method }) =>
    Promise.resolve(
      Response.json(
        {
          gameId: game.gameId,
          gitSha: target.sourceRevision,
          backendOrigin: target.backendOrigin,
          applicationOrigin: target.applicationOrigin,
          expiresAt: run.expiresAt,
          ceilings,
          cell: activatedCell,
          stopped: method === 'DELETE' ? 'operator-stop' : null,
          alarm: null,
          rows: { metadata: 0, history: 0 },
        },
        { headers: { 'cf-ray': '8f0c2a1b3c4d5e6f-AMS' } }
      )
    )
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:isolated-load-1105|test');
  await expect(openHostedSession(filename, values)).rejects.toThrow('isolated development');
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:isolated-load-1105|test');
  for (const [change, message] of [
    [{ profile: 'separated' }, 'different profile'],
    [{ case: 'probe' }, 'different case'],
    [{ repetition: '1' }, 'repetition differs'],
    [{ compression: 'off' }, 'compression setting differs'],
    [{ 'max-bytes': '1073741825' }, 'byte limit differs'],
    [{ seed: '7' }, 'keeps the seed'],
    [{ 'profile-cpu': true }, 'namespace analytics'],
  ]) {
    await expect(openHostedSession(filename, { ...values, ...change })).rejects.toThrow(message);
  }
  expect(fetch).not.toHaveBeenCalled();
  ceilings = { ...cell.ceilings, messages: 120_000 };
  await expect(openHostedSession(filename, values)).rejects.toThrow('different ceilings');
  ceilings = cell.ceilings;
  activatedCell = { ...activatedCell, case: 'trace' };
  await expect(openHostedSession(filename, values)).rejects.toThrow('different cell');
  activatedCell = { ...activatedCell, case: 'steady' };
  const session = await openHostedSession(filename, values);
  expect(session.initial.edgeColo).toBe('AMS');
  /* The window is 600 s from startsAt; the margin is one minute past the wall bound, so 539 fits and 540 does not. */
  vi.useFakeTimers();
  vi.setSystemTime(startsAt);
  expect(() => session.assertWindow(539)).not.toThrow();
  expect(() => session.assertWindow(540)).toThrow('steady cell needs 540 seconds');
  vi.useRealTimers();
  expect((await session.stop()).stopped).toBe('operator-stop');
  expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'GET', 'GET', 'DELETE']);
});
