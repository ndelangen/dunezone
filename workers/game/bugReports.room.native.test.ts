import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { Response as NativeResponse } from 'miniflare';
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test';

import type { BugReportProgress } from '../../src/shared/play/bugReports';
import { reportMarker } from './bugReportGithub';
import { draftingRuntime } from './native-drafting.fixture';
import type {
  NativeConnection,
  NativeMessage,
  NativePeer,
  NativeReportServices,
  NativeRuntime,
} from './native-runtime.fixture';
import { admitPlayer, eventually, fixturePass, gameId, required } from './native-runtime.fixture';

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

/*
 * The whole pipeline crosses two Durable Objects, signs a JWT, writes R2 and makes two GitHub round trips.
 * It finishes well under a second on a laptop; 20 s leaves room for a loaded CI runner.
 */
const PIPELINE_MS = 20_000;

beforeEach(() => {
  issuePosts = [];
});
afterEach(async () => {
  await runtime?.close();
  await peer?.close();
  runtime = undefined!;
  peer = undefined!;
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

    const progress = await eventually(
      async () => {
        const response = await status(requestId);
        expect(response.status).toBe(200);
        const current = (await response.json()) as BugReportProgress;
        if (current.stage === 'failed') {
          throw new Error('The report failed instead of completing.');
        }
        return current.stage === 'complete' && current;
      },
      'complete report',
      PIPELINE_MS
    );
    expect(progress).toEqual({ requestId, stage: 'complete', issueUrl: ISSUE_URL });
    expect(issuePosts).toHaveLength(1);

    /* The room records the export under the coordinator's export id, which only the issue body names. */
    const [markerStart, markerEnd] = reportMarker('|').split('|');
    const exportId = required(issuePosts[0]!.body.split(markerStart!)[1]?.split(markerEnd!)[0]);
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

  test('status answers 404 for an unknown report, and a room without the game refuses the pass', async () => {
    await start(true);
    const missing = await status(randomUUID());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'This report was not found.' });
    /* A room that holds no game refuses before any Convex read. */
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

  test('captureBugReport and finishBugReport refuse a room without a game, a malformed id and a foreign issue URL', async () => {
    await start(false);
    const watcher = await admitPlayer(runtime, 'a');
    const requestId = randomUUID();
    const room = runtime.reportRoom(gameId);
    const empty = runtime.reportRoom('another-game');
    const capture = (id: string) => room.captureBugReport(id, 'user-a', 'Synthetic A', browser);
    const finish = (id: string, issueUrl = ISSUE_URL) => room.finishBugReport(id, '', 'A player', issueUrl);

    await expect(empty.captureBugReport(requestId, 'user-a', 'Synthetic A', browser)).rejects.toThrow(
      'The game state is unavailable.'
    );
    await expect(empty.finishBugReport(requestId, '', 'A player', ISSUE_URL)).rejects.toThrow(
      'The game is unavailable.'
    );

    /* The id check itself refuses, not the room: its schema error crosses the stub as a ZodError. */
    await expect(capture('not-a-uuid')).rejects.toThrow('ZodError');
    await expect(finish('not-a-uuid')).rejects.toThrow('ZodError');
    for (const issueUrl of [
      'https://github.com/someone/dunezone/issues/77',
      'https://github.com/ndelangen/dunezone/pull/77',
      'http://github.com/ndelangen/dunezone/issues/77',
      `${ISSUE_URL}#comment`,
    ]) {
      await expect(finish(requestId, issueUrl)).rejects.toThrow('Invalid report issue.');
    }
    const before = watcher.messages.length;
    watcher.send({ type: 'log-history', tab: 'game', before: Number.MAX_SAFE_INTEGER });
    const untouched = await eventually(
      () =>
        watcher.messages
          .slice(before)
          .find(
            (message): message is Extract<NativeMessage, { type: 'log-history' }> => message.type === 'log-history'
          ),
      'Game log page'
    );
    expect(untouched.entries.some((entry) => /report/iu.test(entry.text))).toBe(false);
    expect(
      watcher.messages.some(
        (message) => message.type === 'log-history' && message.entries.some((entry) => /report/iu.test(entry.text))
      )
    ).toBe(false);

    const exported = JSON.parse(await capture(requestId)) as {
      server: { gameId: string };
      browser: { diagnostics: { userAgent: string } };
    };
    expect(exported.server.gameId).toBe(gameId);
    expect(exported.browser.diagnostics.userAgent).toBe('native-report-browser');
    await gameLogWith(watcher, `Report ${requestId}`);

    await expect(finish(requestId)).resolves.toBeUndefined();
    await gameLogWith(watcher, ISSUE_URL);
  }, 30_000);
});
