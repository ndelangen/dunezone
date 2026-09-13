import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { openHostedSession } from './hosted-session.mjs';

let directory;
afterEach(async () => {
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
  await writeFile(
    filename,
    JSON.stringify({
      target,
      run,
      game,
      profile: 'stacked',
      controlSecret: '6'.repeat(64),
    }),
    {
      mode: 0o600,
    }
  );
  const values = {
    origin: target.applicationOrigin,
    profile: 'stacked',
    case: 'probe',
    'profile-cpu': false,
  };
  const fetch = vi.fn((_url, { method }) =>
    Promise.resolve(
      Response.json({
        gameId: game.gameId,
        gitSha: target.sourceRevision,
        backendOrigin: target.backendOrigin,
        applicationOrigin: target.applicationOrigin,
        expiresAt: run.expiresAt,
        stopped: method === 'DELETE' ? 'operator-stop' : null,
        alarm: null,
        rows: { metadata: 0, history: 0 },
      })
    )
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('CONVEX_DEPLOY_KEY', 'prod:isolated-load-1105|test');
  await expect(openHostedSession(filename, values)).rejects.toThrow('isolated development');
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:isolated-load-1105|test');
  const session = await openHostedSession(filename, values);
  expect((await session.stop()).stopped).toBe('operator-stop');
  expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'DELETE']);
});
