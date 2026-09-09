import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { PerspectiveCamera, Vector3 } from 'three';

import {
  cameraPoseFor,
  mapViewTopLimitForViewport,
  TABLE_CAMERA_FIELD_OF_VIEW,
} from '../src/app/routes/_app/play/playView.ts';
import { mapViewFramingPoints } from '../src/app/routes/_app/play/tablePlateGeometry.ts';
import { trackerArcSlots } from '../src/app/routes/_app/play/tableTrackers.ts';

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
  assert.ok(!filename.split(path.sep).includes('..'), 'Private file paths must not contain parent traversal.');
  const parentPath = path.dirname(filename);
  const parent = await lstat(parentPath);
  assert.ok(parent.isDirectory() && (parent.mode & 0o077) === 0, 'Private files need a private parent directory.');
  const canonicalParent = await realpath(parentPath);
  const canonicalFile = path.resolve(canonicalParent, path.basename(filename));
  assert.ok(
    canonicalFile.startsWith(`${canonicalParent}${path.sep}`),
    'Private files must stay in their parent directory.'
  );
  try {
    const entry = await lstat(canonicalFile);
    assert.ok(
      entry.isFile() && (entry.mode & 0o077) === 0,
      'Private files must not be symlinks or readable by others.'
    );
  } catch (error) {
    if (!(allowMissing && error.code === 'ENOENT')) {
      throw error;
    }
  }
  return canonicalFile;
}
async function canonicalDirectory(directory) {
  try {
    return await realpath(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    const parent = await canonicalDirectory(path.dirname(directory));
    return path.join(parent, path.basename(directory));
  }
}
const origin = localOrigin(values.origin, '--origin');
const environmentPath = await privateFile(values['env-file']);
const environment = parseEnv(await readFile(environmentPath, 'utf8'));
const backend = localOrigin(environment.CONVEX_SELF_HOSTED_URL, 'CONVEX_SELF_HOSTED_URL');
assert.notEqual(origin, backend, 'The publisher and Convex backend need separate ports.');
const credentialsPath = await privateFile(values['credentials-file'], true);
assert.ok(path.isAbsolute(values['report-dir']), '--report-dir needs an absolute path.');
const outputDirectory = await canonicalDirectory(path.resolve(values['report-dir']));
for (const filename of [environmentPath, credentialsPath]) {
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
const runDirectory = path.join(outputDirectory, `run-${Date.now()}`);
const directory = pathToFileURL(runDirectory + path.sep);
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
        .evaluate((element) => element.dataset.tableView)
        .then((value) => value === view),
    'View selection failed.'
  );
  await delay(400);
}
async function point(who, position, view = 'left') {
  const bounds = await who.page.locator('.dune-play-shell canvas').boundingBox();
  assert.ok(bounds);
  const header = await who.page.locator('.seated-header').boundingBox();
  const pose = cameraPoseFor(
    view,
    bounds.width / bounds.height,
    mapViewFramingPoints(trackerArcSlots(9), 6),
    mapViewTopLimitForViewport(bounds.height, header?.height ?? 0)
  );
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

function remoteCursor(recipient, sender) {
  return recipient.page
    .getByText(sender.view().viewer.displayName, { exact: true })
    .locator('..')
    .filter({ has: recipient.page.locator('svg') })
    .locator('svg');
}

async function cursorBounds(recipient, sender) {
  const hand = remoteCursor(recipient, sender);
  await hand.waitFor({ state: 'visible' });
  const hasVisibleOpacity = await hand.evaluate((element) => {
    for (let current = element; current; current = current.parentElement) {
      if (Number(getComputedStyle(current).opacity) === 0) {
        return false;
      }
    }
    return true;
  });
  assert.ok(hasVisibleOpacity, 'The remote cursor or one of its ancestors is fully transparent.');
  const bounds = await hand.boundingBox();
  assert.ok(bounds, 'The remote cursor must have visible bounds.');
  return bounds;
}

async function rejectTransparentCursor(recipient, sender) {
  const hand = remoteCursor(recipient, sender);
  for (const [name, target] of [
    ['cursor', hand],
    ['ancestor', hand.locator('..')],
  ]) {
    const previousStyles = await target.evaluate((element) =>
      ['opacity', 'transition-property'].map((property) => ({
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      }))
    );
    try {
      const injected = await target.evaluate((element) => {
        element.style.setProperty('transition-property', 'none', 'important');
        element.style.setProperty('opacity', '0', 'important');
        const computed = getComputedStyle(element);
        return { opacity: computed.opacity, transition: computed.transition, tag: element.tagName };
      });
      assert.equal(injected.opacity, '0', `${name} opacity injection must take effect: ${JSON.stringify(injected)}`);
      /* The previous geometry-only check accepts this invisible cursor. Keep that control beside the new rejection. */
      await hand.waitFor({ state: 'visible' });
      assert.ok(await hand.boundingBox(), 'The transparent cursor must retain its bounds for the negative probe.');
      await assert.rejects(
        () => cursorBounds(recipient, sender),
        { message: 'The remote cursor or one of its ancestors is fully transparent.' },
        `${name} with computed opacity zero must fail cursor visibility`
      );
    } finally {
      const restoredOpacity = await target.evaluate((element, previous) => {
        let opacity;
        for (const { property, value, priority } of previous) {
          if (value) {
            element.style.setProperty(property, value, priority);
          } else {
            element.style.removeProperty(property);
          }
          if (property === 'opacity') {
            opacity = getComputedStyle(element).opacity;
          }
        }
        return opacity;
      }, previousStyles);
      assert.ok(Number(restoredOpacity) > 0, 'The negative probe must restore cursor opacity before transitions.');
    }
    await cursorBounds(recipient, sender);
  }
  passed('Cursor visibility rejects opacity zero on the cursor and its ancestors');
}

async function cursorAt(recipient, sender, position) {
  const expected = await point(recipient, position, 'map');
  return until(async () => {
    const bounds = await cursorBounds(recipient, sender);
    return Math.abs(bounds.x - expected.x) < 16 && Math.abs(bounds.y - expected.y) < 16 && bounds;
  }, 'The visible remote cursor did not reach the expected board position.');
}

async function redPixels(who, center) {
  const clip = { x: Math.round(center.x) - 24, y: Math.round(center.y) - 24, width: 48, height: 48 };
  const png = await who.page.screenshot({ clip });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] > 45 && data[offset + 1] < data[offset] * 0.5 && data[offset + 2] < data[offset] * 0.75) {
      count++;
    }
  }
  return count;
}

async function visibleActivity(sender, recipient, name) {
  await focus(sender, 'map');
  await focus(recipient, 'map');
  const savedRevision = sender.view().snapshot.revision;
  const first = await point(sender, [0, 0.38, 1], 'map');
  const second = await point(sender, [1, 0.38, 1], 'map');
  await sender.page.mouse.move(first.x, first.y);
  const firstCursor = await cursorAt(recipient, sender, [0, 0.38, 1]);
  await sender.page.mouse.move(second.x, second.y, { steps: 8 });
  const secondCursor = await cursorAt(recipient, sender, [1, 0.38, 1]);
  assert.ok(Math.hypot(secondCursor.x - firstCursor.x, secondCursor.y - firstCursor.y) > 30);
  await capture(recipient, `${name}-cursor`);
  passed(`${name}: the recipient sees the other player's cursor moving`);

  const id = 'harkonnen-force-stack';
  const source = piece(sender, id);
  const start = await point(
    sender,
    source.position.map((value, index) => (index === 1 ? value + 0.12 : value)),
    'map'
  );
  const targets = [
    [0, 0.38, 1.6],
    [1.2, 0.38, 1.6],
  ];
  await sender.page.mouse.move(10, 10);
  const destinations = [];
  for (const position of targets) {
    const senderPoint = await point(sender, position, 'map');
    const recipientPoint = await point(recipient, position, 'map');
    destinations.push({ senderPoint, recipientPoint, baseline: await redPixels(recipient, recipientPoint) });
  }
  await capture(recipient, `${name}-before-carry`);
  const sentBefore = sender.sent.length;
  await sender.page.mouse.move(start.x, start.y);
  await sender.page.mouse.down();
  try {
    await delay(350);
    for (const [index, destination] of destinations.entries()) {
      await sender.page.mouse.move(destination.senderPoint.x, destination.senderPoint.y, { steps: 12 });
      await until(
        () => sender.sent.slice(sentBefore).some((message) => message.type === 'begin' && message.sourcePieceId === id),
        `${name}: the native drag did not pick up the force stack.`
      );
      await until(
        async () => (await redPixels(recipient, destination.recipientPoint)) > destination.baseline + 40,
        `${name}: the recipient did not render the held red token at destination ${index + 1}.`
      );
      if (index > 0) {
        const previous = destinations[index - 1];
        await until(
          async () => (await redPixels(recipient, previous.recipientPoint)) <= previous.baseline + 10,
          `${name}: the previous destination retained a duplicate token.`
        );
      }
      await capture(recipient, `${name}-carry-${index + 1}`);
    }
  } finally {
    await sender.page.keyboard.press('Escape');
    await sender.page.mouse.up();
  }
  await until(
    () => recipient.messages.findLast((message) => message.type === 'activity')?.carries.length === 0,
    `${name}: cancellation left a remote carry.`
  );
  for (const destination of destinations) {
    await until(
      async () => (await redPixels(recipient, destination.recipientPoint)) <= destination.baseline + 10,
      `${name}: the cancelled token remained visible at a dragged location.`
    );
  }
  assert.equal(sender.view().snapshot.revision, savedRevision);
  assert.equal(recipient.view().snapshot.revision, savedRevision);
  passed(`${name}: held token moves visibly before drop and cancellation restores the saved table`);
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
  assert.equal(await b.page.locator('.dune-play-shell').evaluate((element) => element.dataset.tableView), 'map');
  await capture(a, 'after-hosted-map-1440x1000');
  await a.page.setViewportSize({ width: 900, height: 1000 });
  await focus(a, 'map');
  await capture(a, 'after-hosted-map-900x1000');
  await a.page.setViewportSize({ width: 1440, height: 1000 });
  await focus(a, 'left');
  await focus(b, 'left');
  passed('All four view modes work while the other player keeps an independent camera');

  await visibleActivity(a, b, 'player-a-to-player-b');
  await rejectTransparentCursor(b, a);
  await visibleActivity(b, a, 'player-b-to-player-a');
  await focus(a, 'left');
  await focus(b, 'left');

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
  passed('Native mesh carry reaches the other browser and Escape cancels without a durable write');

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

  await visibleActivity(b, a, 'reloaded-player-b-to-player-a');
  await visibleActivity(a, b, 'player-a-to-reloaded-player-b');

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
  if (!leavingSocket) {
    throw new Error('The leaving player has no game socket.');
  }
  assert.equal(leavingSocket.closed, false);
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
  let message = error.message;
  for (const account of Object.values(credentials)) {
    for (const value of [account.email, account.password]) {
      if (value) {
        message = message.replaceAll(value, '[synthetic credential]');
      }
    }
  }
  report.failure = {
    name: error.name,
    message: message.replace(/\b[a-f0-9]{64}\b/giu, '[redacted]'),
    afterCheck: report.checks.at(-1)?.name ?? 'Startup',
  };
  for (const who of peers) {
    try {
      await capture(who, `failure-${who.label}`);
    } catch {}
  }
  process.exitCode = 1;
  console.error(`Browser verification stopped after: ${report.failure.afterCheck}.`);
  console.error(report.failure.message);
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
