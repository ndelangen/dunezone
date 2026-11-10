import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { Response as NativeResponse } from 'miniflare';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';

import { PLAY_PENDING_TIMEOUT_MS } from '../../src/shared/play/admission';
import type { BugReportProgress } from '../../src/shared/play/bugReports';
import { draftingRuntime } from './native-drafting.fixture';
import type {
  NativeConnection,
  NativeMessage,
  NativePeer,
  NativeReportServices,
  NativeRuntime,
} from './native-runtime.fixture';
import { admitPlayer, eventually, fixturePass, gameId, openGame, required } from './native-runtime.fixture';

/*
 * The report path through the real GameRoom and the real BugReports coordinator, with only GitHub answered by the test.
 * bugReports.native.test.ts covers the coordinator's GitHub outcomes against a stub room; this file covers what the room itself does.
 */

const ISSUE_URL = 'https://github.com/ndelangen/dunezone/issues/77';
const browser = {
  snapshot: { hand: ['Lasgun'] },
  conversations: {},
  logs: [{ at: '2026-11-10T00:00:00Z', level: 'error', text: 'render failed' }],
  droppedLogs: 0,
  diagnostics: {
    clientRevision: 3,
    connection: 'authorized',
    viewport: [1280, 800],
    pixelRatio: 1,
    language: 'en',
    userAgent: 'native-report-browser',
    online: true,
  },
};
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const githubBindings = {
  BUG_REPORT_GITHUB_APP_ID: '123',
  BUG_REPORT_GITHUB_INSTALLATION_ID: '456',
  BUG_REPORT_GITHUB_PRIVATE_KEY: privateKey,
};

let peer: NativePeer;
let runtime: NativeRuntime;
let issuePosts: Array<{ title: string; body: string; labels: string[] }>;

/** A real game in drafting, so its Game log records; with `reports`, the real report coordinator and a GitHub that files every issue. */
const github: NativeReportServices = {
  async github(request) {
    if (new URL(request.url).pathname.endsWith('/access_tokens')) {
      return NativeResponse.json({ token: 'installation-token' });
    }
    if (request.method === 'POST') {
      const post = (await request.json()) as (typeof issuePosts)[number];
      issuePosts.push(post);
      return NativeResponse.json({ html_url: ISSUE_URL, labels: [{ name: 'reported-bug' }], body: post.body });
    }
    return NativeResponse.json([]);
  },
};

async function start(reports: boolean) {
  ({ peer, runtime } = await draftingRuntime(
    [],
    undefined,
    reports ? { bindings: githubBindings, reports: github } : {}
  ));
}

async function report(body: Record<string, unknown>, game = gameId) {
  return await runtime.fetch(`/__play/games/${game}/reports`, {
    method: 'POST',
    headers: { Origin: runtime.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pass: await fixturePass('a'), ...body }),
  });
}

const send = (requestId: string) =>
  report({ operation: 'send', requestId, description: 'A troop cannot be moved.', browser });
const status = (requestId: string) => report({ operation: 'status', requestId });

/** The newest Game log page a connection was sent whose entries mention the text. */
const gameLogWith = (connection: NativeConnection, text: string) =>
  eventually(
    () =>
      connection.messages.findLast(
        (message): message is Extract<NativeMessage, { type: 'log-history' }> =>
          message.type === 'log-history' &&
          message.tab === 'game' &&
          message.entries.some((entry) => entry.text.includes(text))
      ),
    `Game log mentioning ${text}`
  );

beforeEach(() => {
  issuePosts = [];
});
afterEach(async () => {
  await runtime?.close();
  await peer?.close();
});

describe('bug reports through the real GameRoom', () => {
  test('a report exports the room state, files one issue, and announces both log entries to every connection', async () => {
    await start(true);
    const reporter = await admitPlayer(runtime, 'a');
    const watcher = await admitPlayer(runtime, 'b');
    const requestId = randomUUID();

    const sent = await send(requestId);
    expect(sent.status).toBe(202);
    expect(await sent.json()).toEqual({ requestId, stage: 'collecting' });

    const progress = await eventually(async () => {
      const response = await status(requestId);
      expect(response.status).toBe(200);
      const current = (await response.json()) as BugReportProgress;
      return current.stage === 'complete' && current;
    }, 'complete report');
    expect(progress).toEqual({ requestId, stage: 'complete', issueUrl: ISSUE_URL });
    expect(issuePosts).toHaveLength(1);

    /* The room records the export under the coordinator's export id, which only the issue body names. */
    const exportId = required(/dunezone-play-report:([a-f0-9-]{36})/u.exec(issuePosts[0]!.body)?.[1]);
    const exported = required(await runtime.reportState(exportId));
    expect(exported).toMatchObject({
      server: {
        format: 'dunezone-game-report-v1',
        gameId,
        gitSha: 'native-test',
        versionId: 'native-test',
      },
      browser: { diagnostics: { userAgent: 'native-report-browser' } },
    });
    const exportedLog = JSON.stringify((exported.server as { events: unknown }).events);
    expect(exportedLog).toContain(`Report ${exportId}`);

    for (const connection of [reporter, watcher]) {
      const requested = await gameLogWith(connection, `Report ${exportId}`);
      expect(requested.entries.find((entry) => entry.text.includes(`Report ${exportId}`))?.text).toContain(
        'Synthetic A'
      );
      const published = await gameLogWith(connection, ISSUE_URL);
      expect(published.entries.find((entry) => entry.text.includes(ISSUE_URL))?.text).toContain(exportId);
    }

    /* Sending the same request again answers its receipt instead of filing another issue. */
    const repeated = await send(requestId);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ requestId, stage: 'complete' });
    expect(issuePosts).toHaveLength(1);
  }, 30_000);

  test('status answers 404 for an unknown report, and another game refuses the pass', async () => {
    await start(true);
    const missing = await status(randomUUID());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'This report was not found.' });
    expect((await status(randomUUID())).status).toBe(404);
    /* A room that holds no game, or another one, refuses before any Convex read. */
    const before = peer.requests.filter((request) => request.function === 'playBugReports:authorize').length;
    expect((await report({ operation: 'status', requestId: randomUUID() }, 'another-game')).status).toBe(403);
    expect(peer.requests.filter((request) => request.function === 'playBugReports:authorize')).toHaveLength(before);
  }, 30_000);

  test('an unconfigured GitHub app answers 503 with the coordinator message and stores no report', async () => {
    await start(true);
    await runtime.restart({ BUG_REPORT_GITHUB_PRIVATE_KEY: '' });
    const response = await send(randomUUID());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Bug reporting is not available yet. Please try again later.' });
    expect(issuePosts).toHaveLength(0);
  }, 30_000);

  test('a room without a report coordinator answers 503 instead of failing the request', async () => {
    await start(false);
    const response = await send(randomUUID());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Bug reporting is temporarily unavailable. Try again.' });
  }, 30_000);

  test('captureBugReport and finishBugReport refuse a room without a game, a malformed id and a foreign issue URL', async () => {
    await start(false);
    const watcher = await admitPlayer(runtime, 'a');
    const requestId = randomUUID();
    const capture = { step: 'capture' as const, requestId, actorId: 'user-a', displayName: 'Synthetic A', browser };
    const finish = { step: 'finish' as const, requestId, actorId: '', displayName: 'A player', issueUrl: ISSUE_URL };

    expect(await runtime.bugReportCall('another-game', capture)).toEqual({
      ok: false,
      message: 'The game state is unavailable.',
    });
    expect(await runtime.bugReportCall('another-game', finish)).toEqual({
      ok: false,
      message: 'The game is unavailable.',
    });

    expect(await runtime.bugReportCall(gameId, { ...capture, requestId: 'not-a-uuid' })).toMatchObject({ ok: false });
    expect(await runtime.bugReportCall(gameId, { ...finish, requestId: 'not-a-uuid' })).toMatchObject({ ok: false });
    for (const issueUrl of [
      'https://github.com/someone/dunezone/issues/77',
      'https://github.com/ndelangen/dunezone/pull/77',
      'http://github.com/ndelangen/dunezone/issues/77',
      `${ISSUE_URL}#comment`,
    ]) {
      expect(await runtime.bugReportCall(gameId, { ...finish, issueUrl })).toEqual({
        ok: false,
        message: 'Invalid report issue.',
      });
    }
    watcher.send({ type: 'log-history', tab: 'game', before: Number.MAX_SAFE_INTEGER });
    const untouched = await watcher.message('log-history');
    expect(JSON.stringify(untouched.entries)).not.toContain(requestId);

    const captured = await runtime.bugReportCall(gameId, capture);
    expect(captured.ok).toBe(true);
    const exported = JSON.parse((captured as { result: string }).result) as {
      server: { gameId: string };
      browser: { diagnostics: { userAgent: string } };
    };
    expect(exported.server.gameId).toBe(gameId);
    expect(exported.browser.diagnostics.userAgent).toBe('native-report-browser');
    await gameLogWith(watcher, `Report ${requestId}`);

    expect(await runtime.bugReportCall(gameId, finish)).toEqual({ ok: true, result: null });
    await gameLogWith(watcher, ISSUE_URL);
  }, 30_000);
});

describe('the admission timeout', () => {
  test('a socket that never admits is closed with 4408, while an admitted one stays open', async () => {
    await start(false);
    const admitted = await admitPlayer(runtime, 'a');
    const silent = await openGame(runtime);
    expect(silent.closed).toBe(false);
    /* In the native harness a socket that has sent nothing never receives the room's close frame; a keepalive, which a waiting page may send, opens that path. */
    silent.keepalive();
    await eventually(() => silent.keepalives, 'keepalive answer');
    await runtime.clock(PLAY_PENDING_TIMEOUT_MS + 1);
    await eventually(() => silent.closed, 'pending socket closed');
    expect(silent.closeCode).toBe(4408);
    expect(admitted.closed).toBe(false);
    admitted.send({ type: 'metrics' });
    await admitted.message('metrics');
  }, 30_000);

  test('a pass that arrives after the deadline closes the socket with 4408 instead of admitting it', async () => {
    await start(false);
    const late = await openGame(runtime);
    await runtime.clock(PLAY_PENDING_TIMEOUT_MS + 1);
    late.send({ type: 'admit', pass: await fixturePass('a') });
    await eventually(() => late.closed, 'late socket closed');
    expect(late.closeCode).toBe(4408);
    expect(late.messages.some((message) => message.type === 'view')).toBe(false);
  }, 30_000);
});
