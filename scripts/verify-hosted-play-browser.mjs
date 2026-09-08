import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

import { chromium } from 'playwright';
import { PerspectiveCamera, Vector3 } from 'three';

import { cameraPoseFor, TABLE_CAMERA_FIELD_OF_VIEW } from '../src/app/routes/_app/play/playView.ts';

const { values } = parseArgs({
  options: {
    'env-file': { type: 'string' },
    origin: { type: 'string' },
    'credentials-file': { type: 'string' },
    'report-dir': { type: 'string' },
    browser: { type: 'string' },
  },
});
for (const name of ['env-file', 'origin', 'credentials-file', 'report-dir']) {
  assert.ok(values[name], `--${name} is required.`);
}
function localOrigin(value, label) {
  const url = new URL(value);
  assert.ok(
    url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
    `${label} must be an explicit http://127.0.0.1:PORT origin.`
  );
  return url.origin;
}
async function privateFile(filename, allowMissing = false) {
  assert.ok(path.isAbsolute(filename), 'Private files need an absolute path.');
  const parent = await lstat(path.dirname(filename));
  assert.ok(parent.isDirectory() && (parent.mode & 0o077) === 0, 'Private files need a private parent directory.');
  try {
    const entry = await lstat(filename);
    assert.ok(
      entry.isFile() && (entry.mode & 0o077) === 0,
      'Private files must not be symlinks or readable by others.'
    );
  } catch (error) {
    if (!(allowMissing && error.code === 'ENOENT')) {
      throw error;
    }
  }
}
const origin = localOrigin(values.origin, '--origin');
await privateFile(values['env-file']);
const environment = parseEnv(await readFile(values['env-file'], 'utf8'));
const backend = localOrigin(environment.CONVEX_SELF_HOSTED_URL, 'CONVEX_SELF_HOSTED_URL');
assert.notEqual(origin, backend, 'The publisher and Convex backend need separate ports.');
const credentialsPath = values['credentials-file'];
await privateFile(credentialsPath, true);
assert.ok(path.isAbsolute(values['report-dir']), '--report-dir needs an absolute path.');
const outputDirectory = path.resolve(values['report-dir']);
for (const filename of [values['env-file'], credentialsPath]) {
  const relative = path.relative(outputDirectory, filename);
  assert.ok(
    relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'Private files must stay outside the report directory.'
  );
}
let credentials = {};
try {
  credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
const directory = pathToFileURL(`${path.join(outputDirectory, `run-${Date.now()}`)}${path.sep}`);
const allowedOrigins = new Set([origin, backend]);
const allowedSocketOrigins = new Set([...allowedOrigins].map((value) => value.replace('http:', 'ws:')));
const blockedNetwork = [];
await mkdir(directory, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  origin,
  directory: directory.pathname,
  checks: [],
  captures: [],
  pageErrors: [],
  consoleErrors: [],
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) {
      return result;
    }
    await delay(25);
  }
  throw new Error(description);
}
function passed(name, detail = {}) {
  report.checks.push({ name, ...detail });
  console.log(`PASS ${name}`);
}
const browser = await chromium.launch({ headless: true, executablePath: values.browser });
const peers = [];
async function peer(label, context) {
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.route(
      (url) => !allowedOrigins.has(url.origin),
      async (route) => {
        blockedNetwork.push(new URL(route.request().url()).origin);
        await route.abort('blockedbyclient');
      }
    );
    await context.routeWebSocket(
      (url) => !allowedSocketOrigins.has(url.origin),
      async (socket) => {
        blockedNetwork.push(new URL(socket.url()).origin);
        await socket.close();
      }
    );
  }
  const page = await context.newPage();
  const state = {
    label,
    page,
    context,
    messages: [],
    sent: [],
    sockets: [],
    view: () => state.messages.findLast((message) => message.type === 'view'),
  };
  peers.push(state);
  page.on('pageerror', (error) => report.pageErrors.push({ label, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.consoleErrors.push({ label, message: message.text() });
    }
  });
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/__play/games/')) {
      return;
    }
    assert.equal(new URL(socket.url()).search, '');
    state.sockets.push({ url: socket.url(), closed: false });
    const connection = state.sockets.at(-1);
    socket.on('close', () => {
      connection.closed = true;
    });
    socket.on('framesent', (frame) => {
      const message = JSON.parse(frame.payload.toString());
      state.sent.push(message.type === 'admit' ? { type: 'admit', ticketLength: message.ticket.length } : message);
    });
    socket.on('framereceived', (frame) => state.messages.push(JSON.parse(frame.payload.toString())));
  });
  return state;
}
async function signIn(who) {
  credentials[who.label] ??= {
    email: `${who.label}-${randomBytes(8).toString('hex')}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  };
  assert.ok(
    credentials[who.label].email.endsWith('@example.invalid') && typeof credentials[who.label].password === 'string',
    'Only synthetic accounts are accepted.'
  );
  await writeFile(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
  await who.page.goto(`${origin}/auth/login`, { waitUntil: 'domcontentloaded' });
  await who.page.getByLabel('Email', { exact: true }).fill(credentials[who.label].email);
  await who.page.getByLabel('Password', { exact: true }).fill(credentials[who.label].password);
  await who.page.getByTestId('local-auth-submit').click();
  await who.page.getByRole('heading', { name: "You're signed in" }).waitFor();
}
async function enter(who) {
  await who.page.goto(`${origin}/play/hosted?role=alice`, { waitUntil: 'domcontentloaded' });
  await who.page.locator('[data-connection="authorized"]').waitFor();
  await who.page.getByRole('group', { name: 'Table view' }).waitFor();
  await until(() => who.view(), 'The UI did not receive an authorized snapshot.');
  assert.equal(who.sent[0].type, 'admit');
  assert.equal(who.sent[0].ticketLength, 64);
}
async function focus(who, view) {
  await who.page.getByRole('button', { name: new RegExp(`^Focus on ${view}`) }).click();
  await until(
    () =>
      who.page
        .locator('.dune-play-shell')
        .getAttribute('data-table-view')
        .then((value) => value === view),
    'View selection failed.'
  );
  await delay(400);
}
async function point(who, position, view = 'left') {
  const bounds = await who.page.locator('.dune-play-shell canvas').boundingBox();
  assert.ok(bounds);
  const pose = cameraPoseFor(view, bounds.width / bounds.height);
  const camera = new PerspectiveCamera(TABLE_CAMERA_FIELD_OF_VIEW, bounds.width / bounds.height, 0.1, 100);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const projected = new Vector3(...position).project(camera);
  return {
    x: bounds.x + ((projected.x + 1) * bounds.width) / 2,
    y: bounds.y + ((1 - projected.y) * bounds.height) / 2,
  };
}
const piece = (who, id) => {
  const result = who.view().snapshot.table.pieces.find((value) => value.id === id);
  assert.ok(result, `Missing ${id}`);
  return result;
};
async function revision(who, expected) {
  await until(
    () => who.view().snapshot.revision === expected,
    `Expected revision ${expected}, got ${who.view().snapshot.revision}.`
  );
}
async function capture(who, name) {
  await who.page.evaluate(() => document.fonts.ready);
  const filename = `${name}.png`;
  await who.page.screenshot({ path: new URL(filename, directory).pathname });
  report.captures.push({ filename, label: who.label, viewport: who.page.viewportSize() });
}
try {
  const unsigned = await peer('unsigned');
  await unsigned.page.goto(`${origin}/play/hosted?role=alice`, { waitUntil: 'domcontentloaded' });
  await unsigned.page.getByText('Sign in to join the hosted table.', { exact: true }).waitFor();
  assert.equal(await unsigned.page.locator('canvas').count(), 0);
  assert.equal(unsigned.sockets.length, 0);
  await capture(unsigned, 'after-unsigned-hosted-1440x1000');
  passed('Unsigned direct entry and forged role query receive no table or game socket');

  const a = await peer('player-a');
  await signIn(a);
  await enter(a);
  const b = await peer('player-b');
  await signIn(b);
  await enter(b);
  assert.equal(a.view().viewer.viewerSeat, 'harkonnen');
  assert.equal(b.view().viewer.viewerSeat, 'atreides');
  assert.notEqual(a.view().viewer.userId, b.view().viewer.userId);
  assert.deepEqual(a.view().snapshot, b.view().snapshot);
  const initialItems = a
    .view()
    .snapshot.table.pieces.flatMap((value) => value.items.map((item) => item.id))
    .sort();
  passed('Independent real Password sessions receive server-owned fixture seats and identical snapshots', {
    seats: [a.view().viewer.viewerSeat, b.view().viewer.viewerSeat],
  });
  for (const view of ['left', 'right', 'bottom', 'map']) {
    await focus(a, view);
  }
  assert.equal(await b.page.locator('.dune-play-shell').getAttribute('data-table-view'), 'map');
  await capture(a, 'after-hosted-map-1440x1000');
  await a.page.setViewportSize({ width: 900, height: 1000 });
  await focus(a, 'map');
  await capture(a, 'after-hosted-map-900x1000');
  await a.page.setViewportSize({ width: 1440, height: 1000 });
  await focus(a, 'left');
  await focus(b, 'left');
  passed('All four view modes work while the other player keeps an independent camera');

  const id = 'harkonnen-force-stack';
  const start = await point(
    a,
    piece(a, id).position.map((value, index) => (index === 1 ? value + 0.12 : value))
  );
  const before = a.view().snapshot.revision;
  await a.page.mouse.move(start.x, start.y);
  await a.page.mouse.down();
  await delay(350);
  await a.page.mouse.move(start.x + 35, start.y - 15, { steps: 8 });
  const begin = await until(
    () => a.sent.findLast((message) => message.type === 'begin'),
    'Canvas drag did not begin a carry.'
  );
  assert.equal(begin.sourcePieceId, id);
  await until(
    () =>
      b.messages
        .findLast((message) => message.type === 'activity')
        ?.carries.some((carry) => carry.reservedIds.includes(id)),
    'Other browser did not receive public carry.'
  );
  assert.equal(a.view().snapshot.revision, before);
  assert.equal(b.view().snapshot.revision, before);
  await a.page.keyboard.press('Escape');
  await a.page.mouse.up();
  await until(
    () => b.messages.findLast((message) => message.type === 'activity')?.carries.length === 0,
    'Cancel did not clear remote carry.'
  );
  assert.equal(a.view().snapshot.revision, before);
  passed('Native mesh carry is transient, visible remotely, and Escape cancels without a durable write');

  await a.page.mouse.move(start.x, start.y);
  await a.page.mouse.down();
  await delay(350);
  await a.page.mouse.move(start.x + 70, start.y - 40, { steps: 12 });
  await delay(100);
  await a.page.mouse.up();
  await revision(a, before + 1);
  await revision(b, before + 1);
  assert.deepEqual(a.view().snapshot, b.view().snapshot);
  assert.deepEqual(
    a
      .view()
      .snapshot.table.pieces.flatMap((value) => value.items.map((item) => item.id))
      .sort(),
    initialItems
  );
  passed('Native canvas drop commits once, conserves every item, and converges both browsers');

  await a.page.getByRole('button', { name: 'Next phase', exact: true }).click();
  await revision(a, before + 2);
  await revision(b, before + 2);
  await b.page.getByRole('button', { name: 'Replay from start' }).click();
  await b.page.getByText(/Playback checkpoint 0 of/).waitFor();
  assert.equal(await b.page.getByRole('button', { name: 'Next phase', exact: true }).isDisabled(), true);
  await b.page.getByRole('button', { name: 'Later phase' }).click();
  await b.page.getByText(/Playback checkpoint 1 of/).waitFor();
  await b.page.getByRole('button', { name: 'Return to live' }).click();
  assert.equal(await b.page.getByRole('button', { name: 'Next phase', exact: true }).isEnabled(), true);
  passed('Real phase checkpoint playback is read-only and returns to the current live table');

  const connectionId = b.view().viewer.connectionId;
  const oldDocumentSockets = [...b.sockets];
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  for (const socket of oldDocumentSockets) {
    socket.documentReplaced = true;
  }
  await until(() => b.view().viewer.connectionId !== connectionId, 'Reload did not get a fresh connection.');
  await b.page.locator('[data-connection="authorized"]').waitFor();
  assert.equal(b.view().viewer.viewerSeat, 'atreides');
  assert.equal(b.view().snapshot.revision, before + 2);
  passed('Reload gets a fresh admitted connection while retaining seat and durable revision');

  const observer = await peer('observer');
  await signIn(observer);
  await enter(observer);
  assert.equal(observer.view().viewer.viewerSeat, 'neutral');
  assert.equal(await observer.page.getByRole('button', { name: 'Next phase', exact: true }).isDisabled(), true);
  const observerSent = observer.sent.length;
  await observer.page.mouse.move(500, 500);
  await observer.page.keyboard.press('f');
  await delay(150);
  assert.equal(
    observer.sent.slice(observerSent).some((message) => ['pointer', 'begin', 'command'].includes(message.type)),
    false
  );
  passed('A third real account is a server-assigned observer with no public pointer or write controls');

  const aTab = await peer('player-a-tab', a.context);
  await enter(aTab);
  assert.equal(aTab.view().viewer.userId, a.view().viewer.userId);
  const accountPage = await a.context.newPage();
  await accountPage.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
  await accountPage.getByRole('heading', { name: 'Game lobby' }).waitFor();
  await accountPage.locator('header button[aria-haspopup="menu"]').last().click();
  const revokedAt = Date.now();
  await accountPage.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await until(
    () => [a, aTab].every((who) => who.sockets.every((socket) => socket.closed)),
    'Sign out did not close every tab socket.'
  );
  await until(
    async () => (await a.page.locator('canvas').count()) === 0 && (await aTab.page.locator('canvas').count()) === 0,
    'Signed-out game data remained visible.'
  );
  const lastCounts = [a.messages.length, aTab.messages.length];
  await b.page.getByRole('button', { name: 'Next phase', exact: true }).click();
  await revision(b, before + 3);
  await delay(100);
  assert.deepEqual([a.messages.length, aTab.messages.length], lastCounts);
  passed('Actual UI sign-out removes both tabs and fences later game fanout', {
    logoutAndFanoutCheckMs: Date.now() - revokedAt,
  });

  const leavingSocket = b.sockets.at(-1);
  assert.ok(leavingSocket && !leavingSocket.closed);
  await b.page.getByRole('link', { name: 'Back to lobby' }).click();
  await b.page.getByRole('heading', { name: 'Game lobby' }).waitFor();
  await until(() => leavingSocket.closed, 'Lobby navigation left the active game socket open.');
  const receivedOnExit = b.messages.length;
  const socketCount = b.sockets.length;
  await b.page.goto(`${origin}/play/demo?seats=6`, { waitUntil: 'domcontentloaded' });
  await b.page.getByRole('group', { name: 'Table view' }).waitFor();
  await focus(b, 'map');
  await capture(b, 'after-demo-map-1440x1000');
  await b.page.setViewportSize({ width: 900, height: 1000 });
  await focus(b, 'map');
  await capture(b, 'after-demo-map-900x1000');
  assert.equal(b.sockets.length, socketCount);
  assert.equal(b.messages.length, receivedOnExit);
  passed('Lobby exit closes the hosted connection and the public demo stays local');
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(blockedNetwork, []);
} catch (error) {
  report.failure = { name: error.name, afterCheck: report.checks.at(-1)?.name ?? 'Startup' };
  for (const who of peers) {
    try {
      await capture(who, `failure-${who.label}`);
    } catch {}
  }
  process.exitCode = 1;
  console.error(`Browser verification stopped after: ${report.failure.afterCheck}.`);
} finally {
  const counts = (messages) =>
    messages.reduce((result, message) => ({ ...result, [message.type]: (result[message.type] ?? 0) + 1 }), {});
  report.transport = peers.map((who) => ({
    label: who.label,
    connectionCount: who.sockets.length,
    closedConnectionCount: who.sockets.filter((socket) => socket.closed).length,
    replacedDocumentConnectionCount: who.sockets.filter((socket) => socket.documentReplaced).length,
    sent: counts(who.sent),
    received: counts(who.messages),
    finalRevision: who.view()?.snapshot.revision,
    viewerSeat: who.view()?.viewer.viewerSeat,
  }));
  report.pageErrors = report.pageErrors.length;
  report.consoleErrors = report.consoleErrors.length;
  report.blockedNetworkRequests = blockedNetwork.length;
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL('report.json', directory), JSON.stringify(report, null, 2));
  console.log(`REPORT ${new URL('report.json', directory).pathname}`);
}
