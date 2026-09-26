import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, onTestFinished, test } from 'vitest';
import { WebSocketServer } from 'ws';

import { browsers, socketOriginAllowed } from './browsers.mjs';

test('a game or backend socket is allowed only when it upgrades from an allowed origin, secure or not', () => {
  const hosted = new Set([
    'https://dunezone-play-load-1.ndelangen.workers.dev',
    'https://isolated-load-1.eu-west-1.convex.cloud',
  ]);
  expect(socketOriginAllowed(hosted, 'wss://dunezone-play-load-1.ndelangen.workers.dev/__play/games/g/socket')).toBe(
    true
  );
  expect(socketOriginAllowed(hosted, 'wss://isolated-load-1.eu-west-1.convex.cloud/api/1.0/sync')).toBe(true);
  expect(socketOriginAllowed(hosted, 'wss://exuberant-finch-263.eu-west-1.convex.cloud/api/1.0/sync')).toBe(false);
  expect(socketOriginAllowed(hosted, 'ws://dunezone-play-load-1.ndelangen.workers.dev/__play/games/g/socket')).toBe(
    false
  );
  const local = new Set(['http://127.0.0.1:4000', 'http://127.0.0.1:4001']);
  expect(socketOriginAllowed(local, 'ws://127.0.0.1:4000/__play/games/g/socket')).toBe(true);
  expect(socketOriginAllowed(local, 'ws://127.0.0.1:4002/__play/games/g/socket')).toBe(false);
});

async function networkRequests({ origin, forbiddenOrigin }) {
  const fetchResult = (url) =>
    fetch(url).then(
      (response) => response.ok,
      () => false
    );
  const socketResult = (url) =>
    new Promise((resolve) => {
      const socket = new WebSocket(url);
      socket.onmessage = (event) => {
        socket.close();
        resolve(event.data);
      };
      socket.onerror = socket.onclose = () => resolve('blocked');
    });
  return {
    allowedFetch: await fetchResult(`${origin}/fetch`),
    forbiddenFetch: await fetchResult(`${forbiddenOrigin}/fetch`),
    allowedSocket: await socketResult(`${origin.replace(/^http/, 'ws')}/socket`),
    forbiddenSocket: await socketResult(`${forbiddenOrigin.replace(/^http/, 'ws')}/socket`),
  };
}

/**
 * Playwright gives Chromium 30 s to exit after `browser.close()` before it kills the process.
 * On a loaded Mac the exit can take all of it, so the teardown runs on its own budget and the assertions keep theirs.
 * A body that timed out during launch leaves the teardown waiting on a launch that Playwright bounds at 30 s, so the budget covers both deadlines.
 * The margin above those 60 s covers the kill, the profile removal and closing the local servers.
 */
const teardownBudget = 65_000;

test('browser image measurements retain the cache while pages, workers and popups cannot reach other origins', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'load-browser-'));
  let imageRequests = 0;
  let forbiddenRequests = 0;
  const application = createServer((request, response) => {
    if (request.url === '/pixel.svg') {
      imageRequests++;
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/auth/login') {
      response.end(`<label>Email<input></label><label>Password<input type="password"></label>
        <button data-testid="local-auth-submit" onclick="document.body.innerHTML = '<h1>You&amp;apos;re signed in</h1>'">Sign in</button>`);
      return;
    }
    response.end('<div data-connection="authorized"><img src="/pixel.svg"></div>');
  });
  const forbidden = createServer((_request, response) => {
    forbiddenRequests++;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end('This origin must never receive a request.');
  });
  forbidden.on('upgrade', (_request, socket) => {
    forbiddenRequests++;
    socket.destroy();
  });
  const sockets = new WebSocketServer({ server: application });
  sockets.on('connection', (socket) => socket.send('allowed'));
  await Promise.all(
    [application, forbidden].map((server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)))
  );
  const origin = `http://127.0.0.1:${application.address().port}`;
  const forbiddenOrigin = `http://127.0.0.1:${forbidden.address().port}`;
  const started = browsers({
    origin,
    backend: origin,
    directory,
    onMessage() {},
    onBytes() {},
    stopping: () => false,
  });
  /* The teardown awaits the launch itself, so a browser that starts after the body timed out is still closed. */
  onTestFinished(async () => {
    await (await started.catch(() => undefined))?.close();
    await new Promise((resolve) => sockets.close(resolve));
    await Promise.all([application, forbidden].map((server) => new Promise((resolve) => server.close(resolve))));
    await rm(directory, { recursive: true, force: true });
  }, teardownBudget);
  const run = await started;
  const peer = { index: 0, role: 'observer', user: { email: 'load@example.invalid', password: 'test-password' } };
  await run.connect(peer);
  expect(imageRequests).toBe(1);
  const [cold, warm] = peer.browserReport.imageLoads.map((load) =>
    load.entries.find((entry) => entry.path === '/pixel.svg')
  );
  expect(cold.transferSize).toBeGreaterThan(0);
  expect(warm.transferSize).toBe(0);
  await peer.page.evaluate(
    (url) =>
      Promise.all(
        Array.from(
          { length: 10 },
          (_, index) =>
            new Promise((resolve) => {
              const image = new Image();
              image.onload = image.onerror = resolve;
              image.src = `${url}/forbidden-${index}.png`;
              document.body.appendChild(image);
            })
        )
      ),
    forbiddenOrigin
  );
  expect(forbiddenRequests).toBe(0);
  expect(peer.browserReport.blockedOrigins).toContain(forbiddenOrigin);

  const targets = { origin, forbiddenOrigin };
  const expectedNetwork = {
    allowedFetch: true,
    forbiddenFetch: false,
    allowedSocket: 'allowed',
    forbiddenSocket: 'blocked',
  };
  expect(await peer.page.evaluate(networkRequests, targets)).toEqual(expectedNetwork);
  const workerNetwork = await peer.page.evaluate(
    ({ source, targets }) =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
        const worker = new Worker(url);
        worker.onmessage = (event) => {
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve(event.data);
        };
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(targets);
      }),
    {
      source: `onmessage = async (event) => postMessage(await (${networkRequests.toString()})(event.data));`,
      targets,
    }
  );
  expect.soft(workerNetwork).toEqual(expectedNetwork);

  const popupOpened = peer.page.waitForEvent('popup');
  await peer.page.evaluate((url) => {
    window.open(url);
  }, `${forbiddenOrigin}/popup`);
  const popup = await popupOpened;
  await popup.waitForLoadState('load');
  expect.soft(await popup.locator('body').innerText()).toBe('Blocked origin.');
  const extraPage = await peer.page.context().newPage();
  expect.soft((await extraPage.goto(`${forbiddenOrigin}/page`)).status()).toBe(403);
  expect(forbiddenRequests).toBe(0);
  const collected = await run.collect([peer]);
  expect(collected.blockedOrigins).toContain(forbiddenOrigin);
  expect(collected.blockedTunnels).toContain(new URL(forbiddenOrigin).host);
}, 15_000);
