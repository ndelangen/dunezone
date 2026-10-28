import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { build } from 'esbuild';
import { Miniflare, Response as NativeResponse, convertV4MiniflareOptions } from 'miniflare';
import { afterEach, beforeAll, beforeEach, expect, test } from 'vite-plus/test';

let script: string;
let worker: Miniflare;
let issuePosts: Array<{ title: string; body: string; labels: string[] }>;
let ambiguous: boolean;
let rejectionStatus: number | undefined;
let githubRequests: { url: string; authorization: string | null; body?: unknown }[];
const requestId = randomUUID();
const input = {
  requestId,
  operation: 'send',
  account: 'alice',
  gameId: 'game-a',
  description: 'Dragging does not move the troop.',
  browser: {
    conversations: {},
    snapshot: { hand: ['Lasgun'] },
    logs: [{ at: '2026-10-26T11:00:00Z', level: 'error', text: 'render failed' }],
    droppedLogs: 0,
    diagnostics: {
      clientRevision: 12,
      connection: 'authorized',
      viewport: [1280, 800],
      pixelRatio: 1,
      language: 'en',
      userAgent: 'test-browser',
      online: true,
    },
  },
};
const call = async (overrides: Record<string, unknown> = {}) =>
  await worker.dispatchFetch('https://report.test', {
    method: 'POST',
    body: JSON.stringify({ ...input, ...overrides }),
  });
const json = async (overrides: Record<string, unknown> = {}) =>
  (await (await call(overrides)).json()) as Record<string, unknown>;
async function settled(stage: string) {
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    const progress = await json({ operation: 'status' });
    if (progress.stage === stage) {
      return progress;
    }
    if (progress.stage === 'failed') {
      throw new Error(`Report failed before GitHub; posts=${issuePosts.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Report did not reach ${stage}.`);
}

beforeAll(async () => {
  const result = await build({
    entryPoints: ['workers/game/bugReports.native.fixture.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['cloudflare:workers'],
  });
  script = result.outputFiles[0]!.text;
}, 12_000);
beforeEach(async () => {
  issuePosts = [];
  ambiguous = false;
  rejectionStatus = undefined;
  githubRequests = [];
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-08-11',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: {
        BUG_REPORTS: { className: 'BugReports', useSQLite: true },
        GAME_ROOMS: { className: 'ReportGame', useSQLite: true },
      },
      r2Buckets: ['BUG_REPORT_STATES'],
      bindings: {
        APPLICATION_ORIGIN: 'https://dune.zone',
        BUG_REPORT_GITHUB_APP_ID: '123',
        BUG_REPORT_GITHUB_INSTALLATION_ID: '456',
        BUG_REPORT_GITHUB_PRIVATE_KEY: privateKey,
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        githubRequests.push({ url: request.url, authorization: request.headers.get('Authorization') });
        if (url.pathname.endsWith('/access_tokens')) {
          githubRequests.at(-1)!.body = await request.json();
          return NativeResponse.json({ token: 'installation-token' });
        }

        if (request.method === 'POST') {
          if (rejectionStatus) {
            return NativeResponse.json({ message: 'Request rejected' }, { status: rejectionStatus });
          }
          issuePosts.push((await request.json()) as (typeof issuePosts)[number]);
          return ambiguous
            ? new NativeResponse(null, { status: 502 })
            : NativeResponse.json({
                html_url: 'https://github.com/ndelangen/dunezone/issues/42',
                labels: [{ name: 'reported-bug' }],
                body: issuePosts[0]!.body,
              });
        }
        if (rejectionStatus) {
          return NativeResponse.json([]);
        }
        return NativeResponse.json([
          {
            html_url: 'https://github.com/ndelangen/dunezone/issues/42',
            labels: [{ name: 'reported-bug' }],
            body: issuePosts[0]?.body ?? '',
          },
        ]);
      },
    })
  );
  await worker.ready;
});
afterEach(async () => {
  await worker?.dispose();
});

test('creates one labelled issue, exports server and browser state, records public events, and deduplicates concurrent sends', async () => {
  const results = await Promise.all([json(), json()]);
  expect(results.every((result) => result.status === 200 || result.status === 202)).toBe(true);
  const progress = await settled('complete');
  expect(progress.issueUrl).toBe('https://github.com/ndelangen/dunezone/issues/42');
  expect(issuePosts).toHaveLength(1);
  expect(githubRequests[0]?.body).toEqual({ repositories: ['dunezone'], permissions: { issues: 'write' } });
  expect(githubRequests.every((request) => new URL(request.url).origin === 'https://api.github.com')).toBe(true);
  expect(issuePosts[0]?.labels).toEqual(['reported-bug']);
  const exportId = /reports\/([a-f0-9-]{36})\/state/.exec(issuePosts[0]!.body)![1]!;
  const state = await json({ operation: 'state', requestId: exportId });
  expect(state).toMatchObject({
    server: { state: { privatePredictions: { fremen: 'atreides' } } },
    browser: { snapshot: { hand: ['Lasgun'] } },
  });
  const log = await (await call({ operation: 'log' })).json();
  expect(log).toEqual([
    { event: `requested:${exportId}` },
    { event: `complete:${exportId}:https://github.com/ndelangen/dunezone/issues/42` },
  ]);
  expect((await json({ requestId: randomUUID() })).status).toBe(429);
  expect(await json({ account: 'bob', operation: 'status' })).toBeNull();
}, 12_000);

test('reconciles an ambiguous GitHub result without another issue POST', async () => {
  ambiguous = true;
  await json();
  await settled('uncertain');
  await settled('complete');
  expect(issuePosts).toHaveLength(1);
  expect(githubRequests[0]?.body).toEqual({ repositories: ['dunezone'], permissions: { issues: 'write' } });
  expect(githubRequests.every((request) => new URL(request.url).origin === 'https://api.github.com')).toBe(true);
}, 12_000);

test.each([401, 403, 404, 410, 422, 429])(
  'a definite GitHub %s rejection settles as failed',
  async (status) => {
    rejectionStatus = status;
    await json();
    const until = Date.now() + 8000;
    let progress: Record<string, unknown> = {};
    while (Date.now() < until) {
      progress = await json({ operation: 'status' });
      if (progress.stage !== 'collecting' && progress.stage !== 'creating') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(progress.stage).toBe('failed');
    expect(progress.issueUrl).toBeUndefined();
    expect(await json({ operation: 'status' })).toMatchObject({ stage: 'failed' });
    expect((await json()).progress).toMatchObject({ stage: 'failed' });
    expect(githubRequests.filter((request) => request.url.endsWith('/issues'))).toHaveLength(1);
  },
  12_000
);

test.each([408, 503])(
  'a GitHub %s result remains uncertain and never repeats the POST',
  async (status) => {
    rejectionStatus = status;
    await json();
    await settled('uncertain');
    expect((await json()).progress).toMatchObject({ stage: 'uncertain' });
    expect(githubRequests.filter((request) => request.url.endsWith('/issues'))).toHaveLength(1);
  },
  12_000
);
