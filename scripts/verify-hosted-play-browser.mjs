import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { chromium, errors } from 'playwright';
import sharp from 'sharp';

import { PHASE_VIEWS } from '../src/app/routes/_app/play/playView.ts';
import { turnTrackerLayout } from '../src/app/routes/_app/play/turnTrackerGeometry.ts';
import { phaseAt, TABLE_PHASES, tableProgressFor } from '../src/shared/play/phases.ts';
import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../src/shared/play/protocol.ts';
import { setupReadyRequired, setupStep } from '../src/shared/play/setup.ts';
import { isSpicePiece } from '../src/shared/play/spice.ts';
import { spiceBankSlot } from '../src/shared/play/spiceBank.ts';
import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';
import { trackerArcSlots, TRACKER_DISC_TOP_Y } from '../src/shared/play/tableTrackers.ts';
import { applyRoomUpdate } from '../src/shared/play/updates.ts';
import { loopbackOrigin } from './lib/isolated-stack.ts';
import { provisionAccounts, signIn as signInThroughForm } from './lib/synthetic-accounts.ts';
import { privateInputFile } from './play-load/hosted-paths.ts';
import { verifyBattles } from './verify-hosted-battles.mjs';
import { cursorBounds, remoteCursor } from './verify-hosted-cursor.mjs';
import { verifyDecks } from './verify-hosted-decks.mjs';
import { browserFlows, isBrowserFlow } from './verify-hosted-flows.ts';
import { verifyPrivateSpiceReserves } from './verify-hosted-private-spice-reserves.mjs';
import { verifyPublicControls } from './verify-hosted-public-controls.mjs';
import { parseExpectedRenderer, rendererMismatch, rendererReport, runningChromium } from './verify-hosted-renderer.ts';
import { verifyResults } from './verify-hosted-results.mjs';

const { values } = parseArgs({
  options: {
    'env-file': { type: 'string' },
    origin: { type: 'string' },
    'credentials-file': { type: 'string' },
    'report-dir': { type: 'string' },
    browser: { type: 'string' },
    flow: { type: 'string', default: 'regular' },
    'ruleset-id': { type: 'string' },
    'expect-renderer': { type: 'string' },
  },
});
for (const name of ['env-file', 'origin', 'credentials-file', 'report-dir', 'ruleset-id']) {
  assert.ok(values[name], `--${name} is required.`);
}
assert.ok(isBrowserFlow(values.flow), `--flow must be one of ${Object.keys(browserFlows).join(', ')}.`);
const expectedRenderer = parseExpectedRenderer(values['expect-renderer']);
const flow = browserFlows[values.flow];
const flows = {
  regular: verifyRegular,
  'public-controls': verifyPublicControls,
  'private-spice-reserves': verifyPrivateSpiceReserves,
  battles: verifyBattles,
  decks: verifyDecks,
  results: verifyResults,
};
assert.deepEqual(
  new Set(Object.keys(flows)),
  new Set(Object.keys(browserFlows)),
  'Every registered flow needs a driver.'
);
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
const origin = loopbackOrigin(values.origin, '--origin');
const environmentPath = await privateInputFile(values['env-file']);
const environment = parseEnv(await readFile(environmentPath, 'utf8'));
const backend = loopbackOrigin(environment.CONVEX_SELF_HOSTED_URL, 'CONVEX_SELF_HOSTED_URL');
assert.notEqual(origin, backend, 'The publisher and Convex backend need separate ports.');
/* The script writes the flow's synthetic accounts back here, about 130 bytes each, far inside the input file's 8 KiB cap. */
const credentialsPath = await privateInputFile(values['credentials-file'], { allowMissing: true });
assert.ok(path.isAbsolute(values['report-dir']), '--report-dir needs an absolute path.');
const outputDirectory = await canonicalDirectory(path.resolve(values['report-dir']));
for (const filename of [environmentPath, credentialsPath]) {
  const relative = path.relative(outputDirectory, filename);
  assert.ok(
    relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'Private files must stay outside the report directory.'
  );
}
assert.ok(environment.CONVEX_SELF_HOSTED_ADMIN_KEY, 'The environment file needs CONVEX_SELF_HOSTED_ADMIN_KEY.');
let credentials = {};
try {
  credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
/* Every account a flow signs in. A player's second tab shares that player's context, and the `unsigned` peer never signs in. */
const SIGNED_IN = ['player-a', 'player-b', 'observer', 'visitor'];
for (const label of SIGNED_IN) {
  credentials[label] ??= {
    email: `${label}-${randomBytes(8).toString('hex')}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  };
  assert.ok(
    credentials[label].email.endsWith('@example.invalid') && typeof credentials[label].password === 'string',
    'Only synthetic accounts are accepted.'
  );
}
await writeFile(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
/*
 * The accounts exist before any browser starts, so a browser's sign-in only signs in and never creates one (#1493).
 * Each request gets the load runner's 15 s, so a backend that never answers fails here by name rather than at the flow's timeout.
 */
const admin = new ConvexHttpClient(backend, {
  logger: false,
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
});
admin.setAdminAuth(environment.CONVEX_SELF_HOSTED_ADMIN_KEY);
await provisionAccounts(
  admin,
  SIGNED_IN.map((label) => credentials[label])
);
const runDirectory = path.join(outputDirectory, `${values.flow}-${Date.now()}`);
const directory = pathToFileURL(runDirectory + path.sep);
const allowedOrigins = new Set([origin, backend]);
const allowedSocketOrigins = new Set([...allowedOrigins].map((value) => value.replace('http:', 'ws:')));
const backendSocketOrigin = backend.replace('http:', 'ws:');
const blockedNetwork = [];
await mkdir(directory, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  flow: values.flow,
  origin,
  directory: directory.pathname,
  checks: [],
  /* Seconds from the start to a point the flow passes on its way, such as reaching play, so CI shows where a flow's time goes (#1594). */
  milestones: {},
  /* Seconds each table entered in play took to mount, load its artwork and draw it, after its Table view group appeared (#1592). */
  tableLoads: [],
  captures: [],
  pageErrors: [],
  consoleErrors: [],
  teardownErrors: [],
  ...(expectedRenderer ? { expectedRenderer } : {}),
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Scrubs the synthetic accounts' credentials and 64-hex secrets from text the report keeps. */
function redactSecrets(text) {
  let message = String(text);
  for (const account of Object.values(credentials)) {
    for (const value of [account.email, account.password]) {
      if (value) {
        message = message.replaceAll(value, '[synthetic credential]');
      }
    }
  }
  return message.replace(/\b[a-f0-9]{64}\b/giu, '[redacted]');
}
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
/** Seconds since the flow started, as the report and the log show them. */
function elapsed() {
  return Math.round((Date.now() - Date.parse(report.startedAt)) / 100) / 10;
}
function passed(name, detail = {}) {
  const elapsedSeconds = elapsed();
  report.checks.push({ name, elapsedSeconds, ...detail });
  console.log(`PASS ${name} (${elapsedSeconds}s)`);
}
function milestone(name) {
  report.milestones[name] = elapsed();
  console.log(`MILESTONE ${name} (${report.milestones[name]}s)`);
}
/*
 * Mouse steps for moving a held piece over the canvas: the piece passes the midpoint, then reaches the destination.
 * Each step can send a carry frame that every page renders, and 8 to 25 steps per move cost up to three minutes a flow on CI (#1343).
 */
const CARRY_STEPS = 2;
/*
 * On Linux, headless Chromium draws WebGL on SwiftShader and composites in software.
 * Each WebGL frame is then read back on the page's main thread, which held the page's timers seconds late on CI (#1343).
 * `--use-angle=swiftshader` keeps WebGL on SwiftShader and composites there too.
 * macOS gets no switch, so full Chromium there draws the table with WebGPU on Metal, which the `hosted_play_webgpu` CI job expects (#1322).
 * Playwright's default headless shell reads frames back on macOS too.
 */
const chromiumArgs = process.platform === 'linux' ? ['--use-angle=swiftshader'] : [];
const browser = await chromium.launch({ headless: true, executablePath: values.browser, args: chromiumArgs });
/*
 * Without `--browser`, `headless: true` launches Playwright's headless shell rather than its full Chromium.
 * The running browser reports which of the two it is and its executable; `args` are the switches this script adds.
 * `SystemInfo.getInfo` waits for the GPU process's feature info, and Chromium 151 ends the browser process when that takes more than 30 s on macOS and Linux, so a browser that closes here without a message points at the GPU process.
 */
const devtools = await browser.newBrowserCDPSession();
const [{ product }, { commandLine }] = await Promise.all([
  devtools.send('Browser.getVersion'),
  devtools.send('SystemInfo.getInfo'),
]);
await devtools.detach();
report.chromium = { ...runningChromium(product, commandLine), version: browser.version(), args: chromiumArgs };
console.log(`CHROMIUM ${JSON.stringify(report.chromium)}`);
/*
 * three.js announces each renderer it constructs to a `__THREE_DEVTOOLS__` event target when the page defines one, the hook its browser devtools use.
 * This init script defines one that keeps each announced renderer by its canvas, so `recordRenderer` can ask the table's renderer which backend it initialised.
 * No app code reads the hook and three.js only dispatches events to it, so the table draws as it does without it.
 */
function observeRenderers() {
  const renderers = new WeakMap();
  const hook = new EventTarget();
  hook.addEventListener('observe', (event) => {
    if (event.detail?.isRenderer) {
      renderers.set(event.detail.domElement, event.detail);
    }
  });
  Object.assign(window, { __THREE_DEVTOOLS__: hook, hostedPlayRenderers: renderers });
}
/**
 * Runs in every page before its scripts: keeps each change of the table's connection state and status line, so a flow stuck before the table (#1378) shows whether the page looped through reconnects or never left its first attempt.
 * The status line is the page's own text, and the list keeps the newest 60 changes.
 */
function observeConnectionStatus() {
  const changes = [];
  let last = '';
  let observer;
  /* The waits before the subscription carry no connection state, so the status line is found first and its state beside it. */
  const record = () => {
    const status = document.querySelector('[role="status"]');
    const connection = status?.closest('[data-connection]')?.getAttribute('data-connection') ?? null;
    const text = status?.textContent ?? null;
    const key = `${connection}|${text}`;
    if (key !== last) {
      last = key;
      changes.push({ at: Math.round(performance.timeOrigin + performance.now()), connection, status: text });
      changes.splice(0, Math.max(0, changes.length - 60));
    }
    /* Once admitted, the page's status lines are the table's own, so watching stops rather than costing the table frames. */
    if (connection === 'authorized') {
      observer?.disconnect();
    }
  };
  Object.assign(window, { hostedPlayConnection: changes });
  /* The document exists before any page script runs, so no change during the first load is missed. */
  observer = new MutationObserver(record);
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-connection'],
  });
  record();
}
/** Runs in the page: the backend the table canvas's renderer initialised, or why it cannot name one yet. */
function readTableRenderer(canvas) {
  const renderer = window.hostedPlayRenderers?.get(canvas);
  if (!renderer) {
    return { unidentified: 'three.js announced no renderer for the table canvas' };
  }
  if (!renderer.initialized) {
    return { unidentified: 'the table renderer did not finish initialising' };
  }
  const { backend } = renderer;
  if (backend.isWebGPUBackend) {
    const info = backend.device?.adapterInfo;
    return { backend: 'webgpu', adapter: { vendor: info?.vendor ?? '', architecture: info?.architecture ?? '' } };
  }
  if (backend.isWebGLBackend) {
    const debug = backend.gl.getExtension('WEBGL_debug_renderer_info');
    return {
      backend: 'webgl2',
      glRenderer: backend.gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : backend.gl.RENDERER),
    };
  }
  return { unidentified: 'the table renderer has neither a WebGPU nor a WebGL2 backend' };
}
function holdToExpectedRenderer() {
  const mismatch = rendererMismatch(expectedRenderer, report.renderer);
  if (mismatch) {
    throw new Error(mismatch);
  }
}
/**
 * Records the backend of the first table this flow opens and holds it to `--expect-renderer`.
 * The renderer initialises asynchronously and can still be doing so when the shell opens, so this reads until it names a backend or 15 s pass.
 */
async function recordRenderer(who) {
  const canvas = who.page.locator('.dune-play-shell canvas');
  const deadline = Date.now() + 15_000;
  let observation = await canvas.evaluate(readTableRenderer);
  while ('unidentified' in observation && Date.now() < deadline) {
    await delay(100);
    observation = await canvas.evaluate(readTableRenderer);
  }
  report.renderer = { ...rendererReport(observation), label: who.label };
  console.log(`RENDERER ${JSON.stringify(report.renderer)}`);
  holdToExpectedRenderer();
}
const otherBrowsers = [];
const peers = [];
async function peer(label, context) {
  if (!context) {
    let owner = browser;
    if (flow.separateBrowsers && label === 'player-b') {
      owner = await chromium.launch({ headless: true, executablePath: values.browser, args: chromiumArgs });
      otherBrowsers.push(owner);
    }
    context = await owner.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.addInitScript(observeRenderers);
    await context.addInitScript(observeConnectionStatus);
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
    rawMessages: [],
    sent: [],
    sockets: [],
    /* The page's Convex sync sockets and its ticket mutations on them, by time only: a ticket is a credential and never recorded. */
    admission: { convexSockets: [], tickets: [], authErrors: 0 },
    view: () => state.messages.findLast((message) => message.type === 'view'),
    /* The phase cooldown the Worker stated in its latest view or update, and when that frame arrived. */
    phaseCooldown: { ms: 0, receivedAt: 0 },
  };
  peers.push(state);
  page.on('pageerror', (error) => report.pageErrors.push({ label, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.consoleErrors.push({ label, message: message.text() });
    }
  });
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).origin === backendSocketOrigin) {
      observeAdmission(state, socket);
      return;
    }
    if (!socket.url().includes('/__play/games/')) {
      return;
    }
    assert.equal(new URL(socket.url()).search, '');
    /* The driver's clock when Playwright reported the refusal and the close, for the sign-out report (#1592). */
    state.sockets.push({ url: socket.url(), closed: false, refusedAt: null, closedAt: null });
    const connection = state.sockets.at(-1);
    socket.on('close', () => {
      connection.closed = true;
      connection.closedAt = Date.now();
    });
    socket.on('framesent', (frame) => {
      if (frame.payload.toString() === KEEPALIVE_PING) {
        return;
      }
      const message = JSON.parse(frame.payload.toString());
      state.sent.push(message.type === 'admit' ? { type: 'admit', ticketLength: message.ticket.length } : message);
    });
    socket.on('framereceived', (frame) => {
      if (frame.payload.toString() === KEEPALIVE_PONG) {
        return;
      }
      const message = JSON.parse(frame.payload.toString());
      if (message.type === 'admission' && message.status === 'denied') {
        connection.refusedAt ??= Date.now();
      }
      if (typeof message.phaseCooldownMs === 'number') {
        state.phaseCooldown = { ms: message.phaseCooldownMs, receivedAt: Date.now() };
      }
      state.messages.push(message);
      state.rawMessages.push(message);
      if (message.type === 'update') {
        const updated = applyRoomUpdate(state.view(), message);
        if (updated) {
          state.messages.push(updated);
          state.messages.push({
            type: 'activity',
            epoch: updated.epoch,
            carries: updated.carries,
            pointers: updated.pointers,
          });
        }
      }
    });
  });
  return state;
}
/** Records when each Convex sync socket opened and closed, and when each ticket mutation went out and was answered. */
function observeAdmission(state, socket) {
  const connection = { openedAt: Date.now(), closedAt: null };
  state.admission.convexSockets.push(connection);
  socket.on('close', () => {
    connection.closedAt = Date.now();
  });
  socket.on('framesent', (frame) => {
    const message = parseFrame(frame.payload);
    if (message?.type !== 'Mutation' || !(message.udfPath ?? '').endsWith('issueTicket')) {
      return;
    }
    /* A reconnecting Convex client sends its unanswered mutations again under the same request id. */
    const resent = state.admission.tickets.find((entry) => entry.requestId === message.requestId);
    if (resent) {
      resent.sends += 1;
      return;
    }
    state.admission.tickets.push({ requestId: message.requestId, sentAt: Date.now(), sends: 1, answeredAt: null });
  });
  socket.on('framereceived', (frame) => {
    const message = parseFrame(frame.payload);
    if (message?.type === 'AuthError') {
      state.admission.authErrors += 1;
    }
    const ticket =
      message?.type === 'MutationResponse' &&
      state.admission.tickets.find((entry) => entry.requestId === message.requestId && entry.answeredAt === null);
    if (ticket) {
      ticket.answeredAt = Date.now();
      /* A refusal is a successful mutation with an ok:false result; the result's ticket itself is never kept. */
      ticket.outcome =
        message.success !== true ? 'failed' : message.result?.ok ? 'issued' : (message.result?.reason ?? 'refused');
    }
  });
}
function parseFrame(payload) {
  try {
    return JSON.parse(payload.toString());
  } catch {
    return null;
  }
}
/** What a peer's page and sockets say about its admission, for a failure report: times are milliseconds after the report started. */
async function admissionTrace(who) {
  const start = Date.parse(report.startedAt);
  const since = (time) => (time === null ? null : time - start);
  let timer;
  const statuses = await Promise.race([
    who.page.evaluate(() => window.hostedPlayConnection ?? []),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve([]), 5000);
    }),
  ])
    .catch(() => [])
    .finally(() => clearTimeout(timer));
  return {
    label: who.label,
    gameSockets: who.sockets.length,
    convexSockets: who.admission.convexSockets.map((entry) => ({
      openedAt: since(entry.openedAt),
      closedAt: since(entry.closedAt),
    })),
    tickets: who.admission.tickets.map((entry) => ({
      sentAt: since(entry.sentAt),
      sends: entry.sends,
      answeredAt: since(entry.answeredAt),
      outcome: entry.outcome ?? null,
    })),
    authErrors: who.admission.authErrors,
    statuses: statuses.map((entry) => ({ ...entry, at: since(entry.at) })),
  };
}
/** The regular flow's sign-out: the tabs it should close and when Sign out was clicked. */
let signOut = null;
/**
 * When each signed-out tab's game sockets received the Worker's refusal and closed, in milliseconds after the Sign out click (#1592).
 * Both times are the driver's, when Playwright reported each event, and a socket that closed before the click shows a negative time.
 */
function signOutReport() {
  const since = (time) => (time === null ? null : time - signOut.clickedAt);
  return {
    clickedAtSeconds: Math.round((signOut.clickedAt - Date.parse(report.startedAt)) / 100) / 10,
    tabs: signOut.tabs.map((who) => ({
      label: who.label,
      sockets: who.sockets.map((socket) => ({ refusedMs: since(socket.refusedAt), closedMs: since(socket.closedAt) })),
    })),
  };
}
async function signIn(who) {
  assert.ok(credentials[who.label], `${who.label} has no provisioned account; add it to SIGNED_IN.`);
  await signInThroughForm(who.page, origin, credentials[who.label], who.label);
}
/** The id of the real game this flow creates; every account after the creator enters it. */
let gameId;
const SPECTATOR = 'neutral';
/*
 * How long a table entered in play gets to mount, load its artwork and draw it, after its Table view group appears.
 * On the macOS WebGPU runner a newly opened tab's mount ended up to 13.4 s after that group appeared, and its artwork kept the tab busy up to 9.4 s after its first frame (#1592).
 */
const TABLE_LOAD_MS = 45_000;
/**
 * Waits for a table in play to mount, load its artwork and draw it, and records how long that took.
 * The scene mounts in one task once its renderer has initialised, the frame after it builds the scene's shaders, and each phase symbol and published face that arrives later is parsed or uploaded on the same thread.
 * On the macOS WebGPU runner that work held a newly opened tab's main thread for up to 14.3 s, so a tab signed out meanwhile handled its socket's close only after it (#1592).
 * `window.__duneTable` is installed by an effect that runs after the mount commits, and it counts the artwork loads that have not settled.
 * Two animation frames after that count reaches zero, the frame the last artwork asked for has been drawn.
 */
async function tableLoaded(who) {
  const started = Date.now();
  const loaded = await who.page
    .waitForFunction(
      () =>
        window.__duneTable?.unsettledArtwork() === 0 &&
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))),
      undefined,
      { timeout: TABLE_LOAD_MS }
    )
    .catch((error) => {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }
      throw new Error(
        `${who.label}'s table did not mount, load its artwork and draw within ${TABLE_LOAD_MS / 1000} s.`
      );
    });
  await loaded.dispose();
  report.tableLoads.push({ label: who.label, seconds: Math.round((Date.now() - started) / 100) / 10 });
}
/**
 * Waits for an admitted connection and the table it projects.
 * Before play the stage replaces the table view.
 * A table in play has also mounted, loaded its artwork and drawn it, so the flow's next step does not share the tab with that work.
 */
async function admitted(who) {
  await who.page.locator('[data-connection="authorized"]').waitFor();
  await until(() => who.view(), 'The UI did not receive an authorized snapshot.');
  assert.equal(who.sent[0].type, 'admit');
  assert.equal(who.sent[0].ticketLength, 64);
  if (who.view().snapshot.stage === 'play') {
    await who.page.getByRole('group', { name: 'Table view' }).waitFor();
    await tableLoaded(who);
  }
  if (!report.renderer) {
    await recordRenderer(who);
  }
}
/** Creates the flow's real game through the lobby's Create page, which seats its creator first. */
async function createGame(who) {
  await who.page.goto(`${origin}/play/create`, { waitUntil: 'domcontentloaded' });
  await who.page.getByRole('combobox', { name: 'Ruleset', exact: true }).click();
  /* The seeded ruleset, by the id the launcher passed rather than by its name. */
  await who.page.locator(`[role="option"][value="${values['ruleset-id']}"]`).click();
  await who.page.getByRole('textbox', { name: 'Minimum players', exact: true }).fill('2');
  await who.page.getByRole('button', { name: 'Create game', exact: true }).click();
  await who.page.waitForURL((url) => /^\/play\/(?!create$)[^/]+$/u.test(url.pathname));
  gameId = new URL(who.page.url()).pathname.split('/').at(-1);
  await admitted(who);
  assert.notEqual(who.view().viewer.viewerSeat, SPECTATOR);
  /*
   * The backend provisions this flow's games at the stage the flow table names (#1594).
   * A game at any other stage fails here rather than being played through by hand.
   */
  assert.equal(
    who.view().snapshot.stage,
    flow.startsInPlay ? 'play' : 'drafting',
    'The game did not start at the stage this flow expects.'
  );
}
async function enter(who) {
  assert.ok(gameId, 'No real game was created yet.');
  await who.page.goto(`${origin}/play/${gameId}`, { waitUntil: 'domcontentloaded' });
  await admitted(who);
}
/** A signed-in synthetic account without the Administrator flag: real games admit every signed-in player. */
async function account(label) {
  const who = await peer(label);
  await signIn(who);
  return who;
}
/** A spectator asks for a seat and a seated player approves it, through the seat bar. */
async function seatThrough(approver, who) {
  /* A spectator's seat opens from the header's Seats action. Drafting asks for any seat; later a spectator asks for the open seat by name. */
  await who.page.getByRole('button', { name: 'Seats', exact: true }).click();
  const request = who.page.getByRole('button', { name: /^Request (a seat|seat \d+)/u });
  await until(() => request.isEnabled(), 'The seat request did not become available.', 20_000);
  const before = who.view().snapshot.revision;
  await request.click();
  await until(() => who.view().snapshot.revision > before, 'The seat request did not commit.');
  await act(approver, 'Approve');
  await until(() => who.view().viewer.viewerSeat !== SPECTATOR, 'The approved request did not seat its player.');
}
/** A seated player gives up the seat through the game menu; the seat stays open with its faction. */
async function depart(who) {
  await who.page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await who.page.getByRole('menuitem', { name: 'Give up your seat', exact: true }).click();
  await act(who, 'Leave');
  await until(() => who.view().viewer.viewerSeat === SPECTATOR, 'The departure did not release the seat.');
}
/** Seat indices do not name factions: each player's faction is the one public assignment dealt to their seat. */
function factionOf(who) {
  const seat = who.view().snapshot.roster.seats.find((entry) => entry.id === who.view().viewer.viewerSeat);
  assert.ok(seat?.faction, `${who.label} holds no faction.`);
  return seat.faction;
}
/**
 * Waits for play with the players and the audience at the table.
 * A game the backend provisioned at Turn 1 (#1594) is there already.
 * Any other game is taken through drafting, the deal, trading and setup with ordinary controls.
 * Nothing patches the game: every step is a command the table accepts from its players.
 */
async function playReady(players, audience) {
  const stage = () => players[0].view().snapshot.stage;
  /* A game the backend provisioned at Turn 1 (#1594) has nothing left to play through; every other game is taken there by hand. */
  if (stage() !== 'play') {
    await playThroughSetup(players);
  }
  assert.equal(stage(), 'play');
  for (const who of [...players, ...audience]) {
    await who.page.getByRole('group', { name: 'Table view' }).waitFor();
  }
  await converged([...players, ...audience]);
  milestone('play');
}
/** The setup steps the regular flow walked, in order, as the table showed them. */
const walkedSetup = [];
/**
 * The seated faction's player locks its prediction through the Setup tab (#1232 H1).
 * The other player sees only that it is locked until the predictor reveals it.
 */
async function lockPrediction(players, step) {
  const predictor = players.find((who) => factionOf(who).id === step.factionId);
  const other = players.find((who) => who !== predictor);
  assert.ok(predictor && other, `No seated player holds the faction of ${step.title}.`);
  await openTab(predictor, 'Setup');
  await predictor.page.getByRole('combobox', { name: 'Predicted winner', exact: true }).click();
  await predictor.page.locator(`[role="option"][value="${factionOf(other).id}"]`).click();
  await act(predictor, 'Lock prediction');
  await converged(players);
  assert.deepEqual(predictor.view().snapshot.predictions[step.id].choice, { factionId: factionOf(other).id, turn: 1 });
  assert.equal(
    other.view().snapshot.predictions[step.id].choice,
    undefined,
    'A locked prediction reached the other seat.'
  );
  await openTab(other, 'Setup');
  await other.page.getByText('Prediction locked', { exact: true }).waitFor();
  await act(predictor, 'Reveal prediction');
  await until(
    () => other.view().snapshot.predictions[step.id].choice?.factionId === factionOf(other).id,
    'The revealed prediction did not reach the other seat.'
  );
  await other.page.getByText('Prediction revealed', { exact: true }).waitFor();
}
/** Drafting, the deal, trading and every setup step, with the controls the table offers its players. */
async function playThroughSetup(players) {
  const stage = () => players[0].view().snapshot.stage;
  for (const who of players) {
    await act(who, 'Ready');
  }
  await until(() => stage() === 'swapping', 'The deal did not assign factions.', 30_000);
  for (const who of players) {
    await act(who, 'Ready to start');
  }
  await until(() => stage() === 'setup', 'Trading did not close into setup.', 30_000);
  while (stage() === 'setup') {
    await completeSetupStep(players);
    await act(players[0], 'Next phase');
  }
}
/** Does what the current setup step gates Next on. */
async function completeSetupStep(players) {
  /* Next clears readiness, and a player whose view has not yet reached that step would read its old Ready and skip it (#1481). */
  await converged(players);
  const { setup } = players[0].view().snapshot;
  const step = setupStep(setup);
  walkedSetup.push(step);
  /* A prediction gates on its lock; any other step asks for readiness unless its author turned that off. */
  if (step.kind === 'prediction') {
    await lockPrediction(players, step);
    return;
  }
  if (!setupReadyRequired(setup)) {
    return;
  }
  for (const who of players.filter(
    (player) => !player.view().snapshot.controls.ready.includes(player.view().viewer.viewerSeat)
  )) {
    await act(who, 'Ready');
  }
}
/**
 * Creates a real game for player-a, seats player-b through a request, admits the observer and reaches Turn 1.
 * A game provisioned at Turn 1 offers player-b its open seat by name, as a replacement is offered one.
 * Any other game is played to Turn 1 by hand.
 */
async function seated() {
  const a = await account('player-a');
  await createGame(a);
  const b = await account('player-b');
  await enter(b);
  await seatThrough(a, b);
  const observer = await account('observer');
  await enter(observer);
  await playReady([a, b], [observer]);
  return { a, b, observer };
}
const button = (who, name) => who.page.getByRole('button', { name, exact: true });
/** Clicks an exact-named button once it is enabled and waits for this peer's view to pass the revision it held. */
async function act(who, name) {
  await until(() => button(who, name).isEnabled(), `${name} did not become enabled.`, 20_000);
  /* Read after the control is enabled: a commit that enabled it has then reached this view,
     so the next revision is this click's and not that one arriving late. */
  const before = who.view().snapshot.revision;
  await button(who, name).click();
  await until(() => who.view().snapshot.revision > before, `${name} did not commit.`);
}
async function converged(peers) {
  await until(
    () => peers.every((who) => who.view().snapshot.revision === peers[0].view().snapshot.revision),
    'Recipient revisions did not converge.'
  );
}
/** Opens one tab of the controls panel unless it is already the current one. */
async function openTab(who, name) {
  const tab = who.page.getByRole('tab', { name, exact: true });
  await tab.waitFor({ state: 'attached' }).catch((error) => {
    throw new Error(`${who.label} has no ${name} tab: ${error.message}`);
  });
  /* A real game's seat bar sits above the panel, whose default height then pushes the lower tabs below the window. */
  const box = await tab.boundingBox();
  if (!box || box.y + box.height > who.page.viewportSize().height) {
    await who.page.getByRole('separator', { name: 'Resize controls panel' }).press('End');
  }
  await tab.waitFor();
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
    await who.page.locator(`[role="tab"][aria-label="${name}"][aria-selected="true"]`).waitFor();
  }
}
const shownView = (who) => who.page.locator('.dune-play-shell').evaluate((element) => element.dataset.tableView);
async function focus(who, view) {
  await who.page.getByRole('button', { name: new RegExp(`^Focus on ${view}`) }).click();
  await until(async () => (await shownView(who)) === view, 'View selection failed.');
  await delay(400);
}
/** The view picker's button for the view the active phase recommends, which its dot marks; `pressed` while the camera shows it. */
function recommendedViewButton(who, view, pressed) {
  return who.page.getByRole('button', { name: `Focus on ${view}, recommended for this phase`, exact: true, pressed });
}
/** Waits for the table to install `window.__duneTable`, which it does after its canvas mounts and again after a remount. */
async function tableInstalled(who) {
  const installed = await who.page
    .waitForFunction(() => window.__duneTable !== undefined, undefined, { timeout: 15_000 })
    .catch((error) => {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }
      throw new Error(
        `${who.label}'s table installed no window.__duneTable within 15 s; the verifier needs a build with VITE_E2E_LOCAL_AUTH=true.`
      );
    });
  await installed.dispose();
}
/**
 * In the page: the projection once three reads, each two frames apart, agree;
 * `remounted` when the table uninstalled `window.__duneTable` meanwhile;
 * `null` when the camera kept moving until `timeoutMs`.
 * The camera eases to a newly focused view over several frames, and a software renderer draws them slowly.
 */
async function settledProjection({ value, timeoutMs }) {
  const deadline = performance.now() + timeoutMs;
  const read = () => window.__duneTable?.worldToScreen(value);
  const agree = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  let previous = read();
  let agreeing = 0;
  while (previous && agreeing < 2 && performance.now() < deadline) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const current = read();
    agreeing = current && agree(current, previous) ? agreeing + 1 : 0;
    previous = current;
  }
  if (!previous) {
    return 'remounted';
  }
  return agreeing === 2 ? previous : null;
}
/**
 * The page coordinates of a table position, projected through the camera the page renders once that camera has settled.
 * A table that remounts during the wait is waited for again, up to three times.
 */
async function point(who, position) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await tableInstalled(who);
    const settled = await who.page.evaluate(settledProjection, { value: position, timeoutMs: 10_000 });
    if (settled === null) {
      throw new Error(
        `${who.label}'s camera did not settle within 10 s, so the table position has no stable page point.`
      );
    }
    if (settled !== 'remounted') {
      return settled;
    }
  }
  throw new Error(`${who.label}'s table remounted during three projections in a row.`);
}
/**
 * Hovers the Spice Bank disc in the map view until the canvas shows the disc's pointer cursor, then presses `key`.
 * The scene hit-tests the pointer only when it moves, so a move that reaches a table still mounting never hovers the disc.
 * A table remounts when the Worker re-admits a suspended connection, and one that just opened is still mounting (#1343).
 * So every poll moves onto the disc again, alternating by one pixel so that each move changes the position.
 */
async function spiceBankShortcut(who, key) {
  const slot = spiceBankSlot();
  const canvas = who.page.locator('.dune-play-shell canvas');
  await who.page.getByRole('button', { name: /^Focus on map/ }).focus();
  let nudge = 0;
  await until(async () => {
    const spiceBank = await point(who, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    nudge = 1 - nudge;
    await who.page.mouse.move(spiceBank.x + nudge, spiceBank.y);
    return canvas.evaluate((element) => element.style.cursor === 'pointer');
  }, `The spice disc did not respond to hover before pressing ${key}.`);
  await who.page.keyboard.press(key);
}
/** The ruleset's treachery deck: setup lays each slotted deck out as one stack, the treachery deck on the left of the map. */
function treacheryDeck(who) {
  const deck = who
    .view()
    .snapshot.table.pieces.find((value) => value.stackKey?.startsWith('deck:') && value.position[0] < 0);
  assert.ok(deck, 'Setup supplied no treachery deck.');
  return deck.id;
}
/**
 * The seeded Harkonnen troop reserve: the carry checks look for its red token on screen.
 * Stacks are keyed by persistent troop identity (#1227), and setup lays them out in troop order, so the first is the first troop.
 */
function troopStack(who) {
  const faction = who.view().snapshot.roster.seats.find((seat) => seat.faction?.name === 'Harkonnen')?.faction;
  assert.ok(faction, 'No seat holds the red Harkonnen faction.');
  const stack = who.view().snapshot.table.pieces.find((value) => value.stackKey?.startsWith(`troops:${faction.id}:`));
  assert.ok(stack, 'The Harkonnen seat has no troop reserve on the table.');
  return stack.id;
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

async function headerStructure(who) {
  const header = who.page.locator('.seated-header');
  const logo = header.getByRole('img', { name: 'Dune', exact: true });
  await logo.waitFor({ state: 'visible' });
  await until(
    () => logo.evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
    'The Dune header logo did not load.'
  );
  assert.equal(await header.getByText(/^Phase \d+ of \d+$/u).count(), 0);
  const labels = await header.locator('button, summary, a').allTextContents();
  for (const label of ['Center', 'Help', 'Setup', 'Lobby']) {
    assert.equal(
      labels.some((value) => value.trim() === label),
      false,
      `${label} remained in the header.`
    );
  }
}

async function rejectTransparentCursor(recipient, sender) {
  /* Refresh the cursor after the carry checks, which can outlast its three-second expiry. */
  const position = [0, 0.38, 1];
  const destination = await point(sender, position);
  await sender.page.mouse.move(destination.x, destination.y);
  await cursorAt(recipient, sender, position);
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
  const expected = await point(recipient, position);
  return until(async () => {
    const bounds = await cursorBounds(recipient, sender);
    return Math.abs(bounds.x - expected.x) < 16 && Math.abs(bounds.y - expected.y) < 16 && bounds;
  }, 'The visible remote cursor did not reach the expected board position.');
}

const HIDDEN_CURSOR = 'data-verifier-hidden-cursor';
/**
 * Counts saturated red pixels in the 48 px box around `center` on the recipient's page, with the sender's drawn cursor hidden.
 * The hand and name label take the sender's faction colour, so for the red Harkonnen seat they would count as a red token.
 * A cursor still drawn at an earlier point would then raise a baseline, and a hand could stand in for a held token (#1461).
 * Only the screenshot hides them: the page and its captures still show the cursor.
 */
async function redPixels(recipient, sender, center) {
  await remoteCursor(recipient, sender)
    .locator('..')
    .evaluateAll((elements, attribute) => {
      for (const element of elements) {
        element.setAttribute(attribute, '');
      }
    }, HIDDEN_CURSOR);
  const clip = { x: Math.round(center.x) - 24, y: Math.round(center.y) - 24, width: 48, height: 48 };
  const png = await recipient.page.screenshot({
    clip,
    style: `[${HIDDEN_CURSOR}] { visibility: hidden !important; }`,
  });
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
  const first = await point(sender, [0, 0.38, 1]);
  const second = await point(sender, [1, 0.38, 1]);
  await sender.page.mouse.move(first.x, first.y);
  const firstCursor = await cursorAt(recipient, sender, [0, 0.38, 1]);
  await sender.page.mouse.move(second.x, second.y, { steps: 8 });
  const secondCursor = await cursorAt(recipient, sender, [1, 0.38, 1]);
  assert.ok(Math.hypot(secondCursor.x - firstCursor.x, secondCursor.y - firstCursor.y) > 30);
  await capture(recipient, `${name}-cursor`);
  passed(`${name}: the recipient sees the other player's cursor moving`);

  const id = troopStack(sender);
  const source = piece(sender, id);
  const start = await point(
    sender,
    source.position.map((value, index) => (index === 1 ? value + 0.12 : value))
  );
  const targets = [
    [0, 0.38, 1.6],
    [1.2, 0.38, 1.6],
  ];
  await sender.page.mouse.move(10, 10);
  const destinations = [];
  for (const position of targets) {
    const senderPoint = await point(sender, position);
    const recipientPoint = await point(recipient, position);
    destinations.push({ senderPoint, recipientPoint, baseline: await redPixels(recipient, sender, recipientPoint) });
  }
  await capture(recipient, `${name}-before-carry`);
  const sentBefore = sender.sent.length;
  await sender.page.mouse.move(start.x, start.y);
  await sender.page.mouse.down();
  try {
    await delay(350);
    for (const [index, destination] of destinations.entries()) {
      await sender.page.mouse.move(destination.senderPoint.x, destination.senderPoint.y, { steps: CARRY_STEPS });
      await until(
        () => sender.sent.slice(sentBefore).some((message) => message.type === 'begin' && message.sourcePieceId === id),
        `${name}: the native drag did not pick up the force stack.`
      );
      await until(
        async () => (await redPixels(recipient, sender, destination.recipientPoint)) > destination.baseline + 40,
        `${name}: the recipient did not render the held red token at destination ${index + 1}.`
      );
      if (index > 0) {
        const previous = destinations[index - 1];
        await until(
          async () => (await redPixels(recipient, sender, previous.recipientPoint)) <= previous.baseline + 10,
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
      async () => (await redPixels(recipient, sender, destination.recipientPoint)) <= destination.baseline + 10,
      `${name}: the cancelled token remained visible at a dragged location.`
    );
  }
  assert.equal(sender.view().snapshot.revision, savedRevision);
  assert.equal(recipient.view().snapshot.revision, savedRevision);
  passed(`${name}: held token moves visibly before drop and cancellation restores the saved table`);
}

const displayedPhaseSymbols = new Set();
const servedPhaseSymbols = new Set();
async function displayedPhase(who, index, { held = false } = {}) {
  const phase = phaseAt(index);
  const controls = who.page;
  await openTab(who, 'Phase');
  /*
   * A real game keeps the phase's name and instructions in its help tooltip. While this player holds a board
   * gesture the panel refuses the pointer, and hovering would move the held piece, so only the named help control
   * is checked then.
   */
  /* The phase's own section leads the panel; the Battle phase adds a battle section of the same name below it. */
  const help = controls.getByRole('button', { name: `Help: ${phase.label}`, exact: true }).first();
  await help.waitFor();
  if (!held) {
    await help.hover();
    await controls.getByRole('tooltip').filter({ hasText: phase.instructions }).waitFor();
    await who.page.mouse.move(0, 0);
  }
  const header = who.page.locator('.seated-header');
  await header.getByText(`Turn ${tableProgressFor(index).turn}`, { exact: true }).waitFor();
  await header.getByText(phase.label, { exact: true }).waitFor();
  const symbol = header.locator('svg[aria-hidden="true"] use');
  await symbol.waitFor({ state: 'attached' });
  const href = await symbol.getAttribute('href');
  assert.ok(href, 'The active phase has no SVG reference.');
  const renderedUrl = new URL(href, origin);
  const expectedUrl = new URL(phase.symbol, origin);
  expectedUrl.hash = 'root';
  assert.equal(renderedUrl.origin, origin);
  assert.equal(renderedUrl.href, expectedUrl.href);
  await until(
    () => symbol.evaluate((element) => element.getBBox().width > 0 && element.getBBox().height > 0),
    `The ${phase.label} header symbol did not render.`
  );
  if (!servedPhaseSymbols.has(phase.symbol)) {
    const response = await who.page.request.get(renderedUrl.href);
    assert.equal(response.ok(), true, `The ${phase.label} symbol was not served.`);
    assert.match(response.headers()['content-type'] ?? '', /image\/svg\+xml/iu);
    servedPhaseSymbols.add(phase.symbol);
  }
  displayedPhaseSymbols.add(phase.id);
}

async function readyBeforeAdvance(sender, recipient) {
  if (phaseAt(sender.view().snapshot.phase).id !== 'mentat-pause') {
    return;
  }
  for (const who of [sender, recipient]) {
    if (!who.view().snapshot.controls.ready.includes(who.view().viewer.viewerSeat)) {
      const before = who.view().snapshot.revision;
      await who.page.getByRole('button', { name: 'Ready', exact: true }).click();
      await revision(sender, before + 1);
      await revision(recipient, before + 1);
    }
  }
}

async function phaseStep(sender, recipient, direction = 1, { recipientHeld = false } = {}) {
  if (direction === 1) {
    await readyBeforeAdvance(sender, recipient);
  }
  const before = sender.view().snapshot;
  await sender.page
    .getByRole('button', {
      name: direction === 1 ? 'Next phase' : 'Previous phase',
      exact: true,
    })
    .click();
  await revision(sender, before.revision + 1);
  await revision(recipient, before.revision + 1);
  assert.equal(sender.view().snapshot.phase, before.phase + direction);
  samePublicView(sender, recipient);
  assert.deepEqual(sender.view().snapshot.table.pieces, before.table.pieces);
  assert.equal(sender.view().snapshot.table.stormSectorIndex, before.table.stormSectorIndex);
  await displayedPhase(sender, before.phase + direction);
  await displayedPhase(recipient, before.phase + direction, { held: recipientHeld });
}

async function sharedPhaseFlow(a, b) {
  await focus(a, 'map');
  await focus(b, 'map');
  /* Both players open the Phase tab now: the panel is inert while a board gesture is held, so a
     later tab click during the remote-carry step would be refused. */
  await openTab(a, 'Phase');
  await openTab(b, 'Phase');
  await displayedPhase(a, 0);
  assert.equal(await a.page.getByRole('button', { name: 'Previous phase', exact: true }).isDisabled(), true);
  await a.page.getByRole('heading', { name: 'Storm sector', exact: true }).waitFor();
  passed('Turn 1 starts with shared Storm instructions and no earlier phase');

  const beforeStorm = a.view().snapshot;
  await a.page.getByRole('button', { name: 'Advance one', exact: true }).click();
  await revision(a, beforeStorm.revision + 1);
  await revision(b, beforeStorm.revision + 1);
  assert.equal(a.view().snapshot.phase, beforeStorm.phase);
  assert.notEqual(a.view().snapshot.table.stormSectorIndex, beforeStorm.table.stormSectorIndex);
  samePublicView(a, b);
  passed('Storm movement is shared separately from phase and turn changes');

  const id = troopStack(b);
  const source = piece(b, id);
  const beforeCarry = a.view().snapshot.revision;
  const start = await point(
    b,
    source.position.map((value, index) => (index === 1 ? value + 0.12 : value))
  );
  const target = [-1.5, 0.38, 1.4];
  const targetPoint = await point(b, target);
  /* The next phase recommends a view other than the map (#1389). At the phase change the idle recipient's
     camera moves there, and the carrying player's camera waits for the drop, so the recipient samples the
     held token in both views, each against its own empty board. */
  const nextView = PHASE_VIEWS[phaseAt(a.view().snapshot.phase + 1).id];
  assert.notEqual(nextView, 'map', 'The phase after Storm must recommend a view other than the map.');
  await focus(a, nextView);
  await a.page.mouse.move(10, 10);
  const nextViewPoint = await point(a, target);
  const nextViewBaseline = await redPixels(a, b, nextViewPoint);
  await focus(a, 'map');
  await a.page.mouse.move(10, 10);
  const recipientPoint = await point(a, target);
  const baseline = await redPixels(a, b, recipientPoint);
  await b.page.mouse.move(start.x, start.y);
  await b.page.mouse.down();
  try {
    await delay(350);
    await b.page.mouse.move(targetPoint.x, targetPoint.y, { steps: CARRY_STEPS });
    const carry = await until(
      () =>
        a.messages
          .findLast((message) => message.type === 'activity')
          ?.carries.find((value) => value.reservedIds.includes(id)),
      'The other player did not receive the held token before a phase change.'
    );
    await until(
      async () => (await redPixels(a, b, recipientPoint)) > baseline + 40,
      'The held token was not visible before a phase change.'
    );
    await phaseStep(a, b, 1, { recipientHeld: true });
    assert.ok(
      a.messages.findLast((message) => message.type === 'activity')?.carries.some((value) => value.id === carry.id)
    );
    await recommendedViewButton(a, nextView, true).waitFor();
    await recommendedViewButton(b, nextView, false).waitFor();
    assert.equal(await shownView(b), 'map');
    await until(
      async () => (await redPixels(a, b, nextViewPoint)) > nextViewBaseline + 40,
      'The held token disappeared when the phase changed.'
    );
    assert.equal(await a.page.getByRole('heading', { name: 'Storm sector', exact: true }).count(), 0);
    await capture(a, 'after-phase-change-during-remote-carry');
    passed(
      "A shared phase change moves the idle player's camera to the marked recommended view without cancelling another player's visible drag"
    );
  } finally {
    await b.page.mouse.up();
  }
  const expectedRevision = beforeCarry + 2;
  await revision(a, expectedRevision);
  await revision(b, expectedRevision);
  assert.notDeepEqual(piece(b, id).position, source.position);
  samePublicView(a, b);
  await recommendedViewButton(b, nextView, true).waitFor();
  passed(
    'The player can finish and save the same held-token drop after the phase change, and their camera then moves to the recommended view'
  );

  await phaseStep(a, b, -1);
  assert.equal(await a.page.getByRole('button', { name: 'Previous phase', exact: true }).isDisabled(), true);
  await a.page.getByRole('heading', { name: 'Storm sector', exact: true }).waitFor();
  passed('Previous phase changes the shared tracker without undoing pieces or storm movement');
  for (let index = 0; index < TABLE_PHASES.length; index++) {
    await phaseStep(index % 2 === 0 ? a : b, index % 2 === 0 ? b : a);
  }
  assert.deepEqual(displayedPhaseSymbols, new Set(TABLE_PHASES.map((phase) => phase.id)));
  assert.deepEqual(servedPhaseSymbols, new Set(TABLE_PHASES.map((phase) => phase.symbol)));
  passed('All nine shared phases render their served SVG symbol in both player headers');
  await capture(a, 'after-turn-2-storm-1440x1000');
  await phaseStep(b, a, -1);
  await capture(a, 'after-turn-1-mentat-pause-1440x1000');
  passed('Either seated player can cross the turn boundary forward and backward without rewinding the table');
}

/* Next and Previous stay disabled for the cooldown after a phase change (#1139), which the Worker states on each frame. */
async function phaseCooldownEnded(who) {
  await until(() => Date.now() >= who.phaseCooldown.receivedAt + who.phaseCooldown.ms, 'Phase cooldown did not end.');
}

async function goldPixels(png, center) {
  const clip = { left: Math.round(center.x) - 14, top: Math.round(center.y) - 14, width: 28, height: 28 };
  const { data, info } = await sharp(png).extract(clip).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [red, green, blue] = data.subarray(offset, offset + 3);
    if (red > 100 && green > 75 && red > green * 1.05 && blue < green * 0.82) {
      count++;
    }
  }
  return count;
}

async function sharedSpiceRoundTrip(sender, recipient, count, interact, name) {
  await sender.page.mouse.move(10, 10);
  await recipient.page.mouse.move(10, 10);
  const before = sender.view().snapshot;
  const beforeIds = new Set(before.table.pieces.map((value) => value.id));
  const baselines = await Promise.all([sender, recipient].map((who) => who.page.screenshot()));
  await interact();
  await revision(sender, before.revision + 1);
  await revision(recipient, before.revision + 1);
  const spawned = sender.view().snapshot.table.pieces.filter((value) => !beforeIds.has(value.id));
  assert.equal(spawned.length, 1);
  const stack = spawned[0];
  assert.ok(isSpicePiece(stack));
  assert.equal(stack.items.length, count);
  assert.equal(sender.view().snapshot.phase, before.phase);
  samePublicView(sender, recipient);
  assert.deepEqual(
    sender.view().snapshot.table.pieces.filter((value) => value.id !== stack.id),
    before.table.pieces
  );

  const visibleTop = [stack.position[0], stack.position[1] + stackTopHeight(stack), stack.position[2]];
  const samples = await Promise.all(
    [sender, recipient].map(async (who, index) => {
      const center = await point(who, visibleTop);
      return { who, center, baseline: await goldPixels(baselines[index], center) };
    })
  );
  await sender.page.mouse.move(10, 10);
  await recipient.page.mouse.move(10, 10);
  for (const { who, center, baseline } of samples) {
    await until(
      async () => (await goldPixels(await who.page.screenshot(), center)) > baseline + 12,
      `${name}: ${who.label} did not render the new spice stack.`
    );
    await capture(who, `${name}-${who.label}-spawned`);
  }
  passed(`${name}: both players receive and render ${count} shared spice`);

  const start = await point(recipient, visibleTop);
  const spiceBank = spiceBankSlot();
  const destination = await point(recipient, [
    spiceBank.position[0],
    TRACKER_DISC_TOP_Y + 0.015,
    spiceBank.position[2],
  ]);
  const sentBefore = recipient.sent.length;
  await recipient.page.mouse.move(start.x, start.y);
  await recipient.page.mouse.down();
  try {
    await delay(350);
    await recipient.page.mouse.move(destination.x, destination.y, { steps: CARRY_STEPS });
    await until(
      () =>
        recipient.sent
          .slice(sentBefore)
          .some((message) => message.type === 'begin' && message.sourcePieceId === stack.id),
      `${name}: the other player could not pick up the shared spice stack.`
    );
    await until(
      () =>
        sender.messages
          .findLast((message) => message.type === 'activity')
          ?.carries.some((carry) => carry.reservedIds.includes(stack.id)),
      `${name}: the spawning player did not receive the shared spice carry.`
    );
  } finally {
    await recipient.page.mouse.up();
  }
  await revision(sender, before.revision + 2);
  await revision(recipient, before.revision + 2);
  samePublicView(sender, recipient);
  assert.deepEqual(sender.view().snapshot.table.pieces, before.table.pieces);
  assert.equal(sender.view().snapshot.phase, before.phase);
  assert.equal(sender.view().snapshot.table.stormSectorIndex, before.table.stormSectorIndex);
  await until(
    () => sender.messages.findLast((message) => message.type === 'activity')?.carries.length === 0,
    `${name}: returning the spice left a public carry behind.`
  );
  await sender.page.mouse.move(10, 10);
  await recipient.page.mouse.move(10, 10);
  for (const { who, center, baseline } of samples) {
    await until(
      async () => (await goldPixels(await who.page.screenshot(), center)) <= baseline + 6,
      `${name}: ${who.label} retained the deleted spice stack.`
    );
  }
  await capture(sender, `${name}-returned-to-spice-bank`);
  passed(`${name}: the other player drags the full stack onto the Spice Bank and both players see it removed`);
}

/** Clicks the turn wheel's printed `turn`, which the wheel shows around the current one; the click must change nothing (#1683). */
async function clickTurnOnWheel(who, current, turn) {
  /* The page lays the tracker arc out for the game's own turn, which faction phases can lengthen (#1473). */
  const { phase, phases } = who.view().snapshot;
  const turnSlot = trackerArcSlots(tableProgressFor(phase, phases).phases.length).find((slot) => slot.kind === 'turn');
  assert.ok(turnSlot, 'The shared layout must include the turn disc.');
  const sector = turnTrackerLayout({ radius: turnSlot.radius, turn: current }).sectors.find(
    (value) => value.turn === turn
  );
  assert.ok(sector, `Turn ${turn} must be printed on the wheel at turn ${current}.`);
  const wheelPoint = await point(who, [
    turnSlot.position[0] + sector.position[0],
    TRACKER_DISC_TOP_Y + 0.045,
    turnSlot.position[2] + sector.position[2],
  ]);
  await who.page.mouse.click(wheelPoint.x, wheelPoint.y);
}

async function sharedTrackerFlow(a, b) {
  const originalPhase = a.view().snapshot.phase;
  const originalTurn = tableProgressFor(originalPhase).turn;
  await focus(a, 'map');
  await focus(b, 'map');
  /* Past the cooldown, so a click the wheel still acted on would land. */
  await phaseCooldownEnded(a);
  const before = a.view().snapshot.revision;
  await clickTurnOnWheel(a, originalTurn, originalTurn + 1);
  await delay(1000);
  assert.equal(a.view().snapshot.revision, before);
  assert.equal(b.view().snapshot.revision, before);
  assert.equal(a.view().snapshot.phase, originalPhase);
  await displayedPhase(a, originalPhase);
  passed('Clicking a later turn on the wheel changes nothing: the turn moves only through the phases (#1683)');

  await focus(a, 'map');
  await focus(b, 'map');
  await sharedSpiceRoundTrip(a, b, 3, () => spiceBankShortcut(a, '3'), 'spice-key-3');
  for (const [key, count] of [
    ['0', 10],
    ['2', 2],
  ]) {
    await sharedSpiceRoundTrip(b, a, count, () => spiceBankShortcut(b, key), `spice-key-${key}`);
  }
}

/** Setup dealt each player's leaders into a private hand; everything but the spice reserve, the hand and a battle plan is the same for both players. */
function samePublicView(a, b) {
  const shared = (who) => ({ ...who.view().snapshot, bank: undefined, hand: undefined, battlePlan: undefined });
  assert.deepEqual(shared(a), shared(b));
  const handIds = (who) => new Set((who.view().snapshot.hand ?? []).map((piece) => piece.id));
  assert.ok(handIds(a).size > 0 && handIds(b).size > 0, 'Setup did not deal private hands.');
  assert.ok(![...handIds(a)].some((id) => handIds(b).has(id)), 'A private hand reached the other player.');
}

/**
 * The seeded catalogue's custom content reached the real game (#1232 H1): the declaring faction's phases ran in setup, and its Extra sits in its own hand only.
 */
async function seededCustomContent(a, b) {
  assert.deepEqual(
    walkedSetup.map((step) => step.kind),
    ['prediction', 'traitors', 'instruction', 'forces']
  );
  assert.equal(walkedSetup[0].title, 'Bene Gesserit prediction');
  assert.equal(walkedSetup[2].title, 'Synthetic muster');
  const extras = (who) =>
    (who.view().snapshot.hand ?? []).filter((piece) => piece.label === 'Synthetic extra').map((piece) => piece.id);
  const declaring = [a, b].find((who) => factionOf(who).id === walkedSetup[0].factionId);
  for (const who of [a, b]) {
    assert.equal(extras(who).length, who === declaring ? 1 : 0, `${who.label} holds the wrong Extras.`);
  }
  passed(
    "A seeded faction's prediction and ready-gated instruction run in setup, and its Extra reaches only its own hand",
    { steps: walkedSetup.map((step) => step.title) }
  );
}

/** The regular flow, for the broad tabletop interactions the named flows leave out. */
async function verifyRegular() {
  const a = await account('player-a');
  await createGame(a);
  const b = await account('player-b');
  await enter(b);
  await seatThrough(a, b);
  await playReady([a, b], []);
  assert.notEqual(a.view().viewer.viewerSeat, SPECTATOR);
  assert.notEqual(b.view().viewer.viewerSeat, SPECTATOR);
  assert.notEqual(a.view().viewer.viewerSeat, b.view().viewer.viewerSeat);
  assert.notEqual(factionOf(a).id, factionOf(b).id);
  assert.notEqual(a.view().viewer.userId, b.view().viewer.userId);
  /*
   * Player B's seat reaches player A in a later frame at the same revision, so the views are compared once it has.
   * If it never does, the wait ends quietly and the comparison fails with the full diff.
   */
  const seatB = b.view().viewer.viewerSeat;
  await until(() => {
    const { seats, players } = a.view().snapshot.controls;
    return seats.includes(seatB) && players.some((player) => player.seat === seatB);
  }, "Player A's view did not list player B's seat.").catch(() => {});
  samePublicView(a, b);
  await seededCustomContent(a, b);
  const initialItems = a
    .view()
    .snapshot.table.pieces.flatMap((value) => value.items.map((item) => item.id))
    .sort();
  passed(
    'Independent real Password sessions create a real game, take approved seats and receive identical public snapshots with disjoint private hands',
    {
      seats: [a.view().viewer.viewerSeat, b.view().viewer.viewerSeat],
    }
  );
  const visitor = await peer('visitor');
  await signIn(visitor);
  await visitor.page.goto(`${origin}/play/not-a-game`, { waitUntil: 'domcontentloaded' });
  await visitor.page.getByText('This game is not available', { exact: true }).waitFor();
  assert.equal(await visitor.page.locator('canvas').count(), 0);
  assert.equal(visitor.sockets.length, 0);
  await visitor.page.close();
  passed('A signed-in account finds an unknown game id unavailable and opens no socket');
  for (const view of ['left', 'right', 'bottom', 'map']) {
    await focus(a, view);
  }
  assert.equal(await shownView(b), 'map');
  await headerStructure(a);
  await capture(a, 'after-hosted-map-1440x1000');
  await a.page.setViewportSize({ width: 900, height: 1000 });
  await focus(a, 'map');
  await headerStructure(a);
  await capture(a, 'after-hosted-map-900x1000');
  passed('Desktop and narrow headers show the loaded Dune logo without the removed count or controls');
  await a.page.setViewportSize({ width: 1440, height: 1000 });
  await focus(a, 'left');
  await focus(b, 'left');
  passed('All four view modes work while the other player keeps an independent camera');

  await visibleActivity(a, b, 'player-a-to-player-b');
  await rejectTransparentCursor(b, a);
  await visibleActivity(b, a, 'player-b-to-player-a');
  await focus(a, 'left');
  await focus(b, 'left');

  const id = troopStack(a);
  const start = await point(
    a,
    piece(a, id).position.map((value, index) => (index === 1 ? value + 0.12 : value))
  );
  const before = a.view().snapshot.revision;
  await a.page.mouse.move(start.x, start.y);
  await a.page.mouse.down();
  await delay(350);
  await a.page.mouse.move(start.x + 35, start.y - 15, { steps: CARRY_STEPS });
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
  await a.page.mouse.move(start.x + 70, start.y - 40, { steps: CARRY_STEPS });
  await delay(100);
  await a.page.mouse.up();
  await revision(a, before + 1);
  await revision(b, before + 1);
  samePublicView(a, b);
  assert.deepEqual(
    a
      .view()
      .snapshot.table.pieces.flatMap((value) => value.items.map((item) => item.id))
      .sort(),
    initialItems
  );
  passed('Native canvas drop commits once, conserves every item, and converges both browsers');

  await sharedPhaseFlow(a, b);
  await sharedTrackerFlow(a, b);
  /* The live table sits at Mentat pause, whose advance is gated on readiness (#1139); readiness
     is declared before the other player enters read-only playback, where Ready is disabled. */
  await readyBeforeAdvance(a, b);
  const beforePlayback = a.view().snapshot.revision;
  await openTab(b, 'Phase');
  await b.page.getByRole('button', { name: 'Replay from start' }).click();
  await b.page.getByText(/Playback checkpoint 0 of/).waitFor();
  /* A real game's first checkpoints are its stages before play, shown with the playback bar; stepping reaches Turn 1. */
  let checkpoint = 0;
  while ((await b.page.getByRole('tab', { name: 'Phase', exact: true }).count()) === 0) {
    const later = b.page.getByRole('button', { name: 'Later phase' });
    /* The last checkpoint disables the button; a click there would wait out Playwright's timeout instead of saying why. */
    assert.ok(await later.isEnabled(), `Playback ran out of checkpoints at ${checkpoint} before reaching play.`);
    await later.click();
    checkpoint += 1;
    await b.page.getByText(new RegExp(`Playback checkpoint ${checkpoint} of`, 'u')).waitFor();
  }
  assert.ok(checkpoint > 0);
  assert.equal(await b.page.getByRole('button', { name: 'Next phase', exact: true }).isDisabled(), true);
  assert.equal(await b.page.getByRole('button', { name: 'Previous phase', exact: true }).isDisabled(), true);
  await displayedPhase(b, 0);
  await a.page.getByRole('button', { name: 'Next phase', exact: true }).click();
  await revision(a, beforePlayback + 1);
  await revision(b, beforePlayback + 1);
  await displayedPhase(a, TABLE_PHASES.length);
  await displayedPhase(b, 0);
  await b.page.getByRole('button', { name: 'Later phase' }).click();
  await b.page.getByText(new RegExp(`Playback checkpoint ${checkpoint + 1} of`, 'u')).waitFor();
  await b.page.getByRole('button', { name: 'Return to live' }).click();
  /* The live table's cooldown (#1139) can still be running; the controls refresh on its next tick. */
  await until(
    () => b.page.getByRole('button', { name: 'Next phase', exact: true }).isEnabled(),
    'Next phase did not re-enable after returning to live.',
    20_000
  );
  await displayedPhase(b, TABLE_PHASES.length);
  passed(
    'Real phase checkpoint playback steps from drafting into play, is read-only and returns to the current live table'
  );

  const connectionId = b.view().viewer.connectionId;
  const oldDocumentSockets = [...b.sockets];
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  for (const socket of oldDocumentSockets) {
    socket.documentReplaced = true;
  }
  await until(() => b.view().viewer.connectionId !== connectionId, 'Reload did not get a fresh connection.');
  await b.page.locator('[data-connection="authorized"]').waitFor();
  assert.equal(b.view().viewer.viewerSeat, seatB);
  assert.equal(b.view().snapshot.revision, beforePlayback + 1);
  assert.equal(b.view().snapshot.phase, TABLE_PHASES.length);
  await displayedPhase(b, TABLE_PHASES.length);
  passed('Reload gets a fresh admitted connection while retaining seat and durable revision');

  await visibleActivity(b, a, 'reloaded-player-b-to-player-a');
  await visibleActivity(a, b, 'player-a-to-reloaded-player-b');

  /*
   * The observer joins in play, where every check on it is.
   * A third table tab through the earlier stages adds rendering load to the run's longest flow without a check to show for it.
   */
  const observer = await account('observer');
  await enter(observer);
  assert.equal(observer.view().viewer.viewerSeat, SPECTATOR);
  assert.equal(await observer.page.getByRole('button', { name: 'Next phase', exact: true }).isDisabled(), true);
  assert.equal(await observer.page.getByRole('button', { name: 'Previous phase', exact: true }).isDisabled(), true);
  await displayedPhase(observer, TABLE_PHASES.length);
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
  const others = [b, observer];
  const tables = await Promise.all(others.map((who) => who.page.locator('.dune-play-shell canvas').elementHandle()));
  const othersFrom = others.map((who) => who.rawMessages.length);
  const signedOutFrom = [a.rawMessages.length, aTab.rawMessages.length];
  const accountPage = await a.context.newPage();
  await accountPage.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' });
  await accountPage.getByRole('heading', { name: 'Game lobby' }).waitFor();
  await accountPage.locator('[data-app-band] button[aria-haspopup="menu"]').last().click();
  const revokedAt = Date.now();
  signOut = { tabs: [a, aTab], clickedAt: revokedAt };
  await accountPage.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await until(
    () => [a, aTab].every((who) => who.sockets.every((socket) => socket.closed)),
    'Sign out did not close every tab socket.'
  ).catch((error) => {
    const open = [a, aTab].flatMap((who) =>
      who.sockets.flatMap((socket, index) =>
        socket.closed ? [] : [`${who.label} socket ${index + 1} of ${who.sockets.length}`]
      )
    );
    throw new Error(`${error.message} Still open: ${open.join(', ')}.`);
  });
  await until(
    async () => (await a.page.locator('canvas').count()) === 0 && (await aTab.page.locator('canvas').count()) === 0,
    'Signed-out game data remained visible.'
  );
  const lastCounts = [a.messages.length, aTab.messages.length];
  const beforeSignOutFanout = b.view().snapshot.revision;
  await until(
    () => b.page.getByRole('button', { name: 'Next phase', exact: true }).isEnabled(),
    'Next phase did not re-enable before the sign-out fanout check.',
    20_000
  );
  await b.page.getByRole('button', { name: 'Next phase', exact: true }).click();
  await revision(b, beforeSignOutFanout + 1);
  await delay(100);
  assert.deepEqual([a.messages.length, aTab.messages.length], lastCounts);
  /* Another player's sign-out neither pauses nor remounts a table (#1418). */
  for (const [index, who] of others.entries()) {
    const paused = who.rawMessages.slice(othersFrom[index]).filter((message) => message.type === 'admission');
    assert.deepEqual(paused, [], `The sign-out paused ${who.label}.`);
    assert.equal(await tables[index].evaluate((canvas) => canvas.isConnected), true, `${who.label}'s table remounted.`);
  }
  passed('Actual UI sign-out removes both tabs and fences later game fanout; the other players keep their tables', {
    logoutAndFanoutCheckMs: Date.now() - revokedAt,
    workerRefusedSignOut: [a, aTab].some((who, index) =>
      who.rawMessages
        .slice(signedOutFrom[index])
        .some((message) => message.type === 'admission' && message.status === 'denied')
    ),
  });

  const leavingSocket = b.sockets.at(-1);
  if (!leavingSocket) {
    throw new Error('The leaving player has no game socket.');
  }
  assert.equal(leavingSocket.closed, false);
  /* The Next phase press above moves this player's camera to the new phase's view; waiting for that move keeps it from landing after the map is chosen. */
  await recommendedViewButton(b, PHASE_VIEWS[phaseAt(b.view().snapshot.phase).id], true).waitFor();
  await focus(b, 'map');
  const leavingConnectionId = b.view().viewer.connectionId;
  const exitPointer = await point(b, [0, 0.38, 1.5]);
  const beforeExitPointer = observer.messages.length;
  await b.page.mouse.move(exitPointer.x, exitPointer.y);
  await until(
    () =>
      observer.messages
        .slice(beforeExitPointer)
        .findLast((message) => message.type === 'activity')
        ?.pointers.some((pointer) => pointer.connectionId === leavingConnectionId),
    'The observer did not receive public presence before lobby navigation.'
  );
  const activityOnExit = observer.messages.length;
  /* A hard navigation can lose Playwright's old-document close event. Watch the observer before expiry. */
  await Promise.all([
    until(
      () =>
        observer.messages
          .slice(activityOnExit)
          .findLast((message) => message.type === 'activity')
          ?.pointers.every((pointer) => pointer.connectionId !== leavingConnectionId),
      'Lobby navigation left public presence behind.',
      2500
    ),
    b.page.goto(`${origin}/play`, { waitUntil: 'domcontentloaded' }),
  ]);
  leavingSocket.documentReplaced = true;
  await b.page.getByRole('heading', { name: 'Game lobby' }).waitFor();
  passed('Lobby exit removes public presence before pointer expiry');
}

try {
  const unsigned = await peer('unsigned');
  /* The directory asks for sign-in before it looks the game up, so any address stands for every game. */
  await unsigned.page.goto(`${origin}/play/${randomBytes(16).toString('hex')}`, { waitUntil: 'domcontentloaded' });
  await unsigned.page.getByText(/to open a game\.$/u).waitFor();
  assert.equal(await unsigned.page.locator('canvas').count(), 0);
  assert.equal(unsigned.sockets.length, 0);
  await capture(unsigned, 'after-unsigned-game-1440x1000');
  passed('Unsigned direct entry to a game address receives no table or game socket');

  const toolkit = {
    peer,
    signIn,
    enter,
    seated,
    account,
    createGame,
    seatThrough,
    playReady,
    depart,
    spectator: SPECTATOR,
    /* Read when a flow needs it: the game only exists once the flow has created it. */
    currentGameId: () => gameId,
    factionOf,
    treacheryDeck,
    button,
    act,
    converged,
    focus,
    openTab,
    point,
    spiceBankShortcut,
    carrySteps: CARRY_STEPS,
    capture,
    until,
    passed,
    origin,
  };
  await flows[values.flow](toolkit);
  /* A flow that never opens a table records no renderer, which an expected renderer refuses. */
  holdToExpectedRenderer();
  assert.deepEqual(report.pageErrors, []);
  /*
   * three.js logs a WebGPU error that nothing captured and keeps drawing, so a table can pass every pixel check with draws failing (#1272).
   * With #1301 reverted, some runs of the regular flow on the macOS runner passed while logging them (#1322).
   */
  const webgpuError = report.consoleErrors.find(({ message }) => message.includes('Uncaptured WebGPU'));
  if (webgpuError) {
    throw new Error(`${webgpuError.label} logged ${webgpuError.message}`);
  }
  assert.deepEqual(blockedNetwork, []);
} catch (error) {
  /* A bare assertion message ("false !== true") names no step; the first frame inside these scripts does. */
  const frame = error.stack
    ?.split('\n')
    .find((line) => line.includes('verify-hosted-'))
    ?.trim();
  report.failure = {
    name: error.name,
    message: redactSecrets(error.message),
    afterCheck: report.checks.at(-1)?.name ?? 'Startup',
    ...(frame ? { at: frame } : {}),
  };
  report.failure.admission = await Promise.all(peers.map(admissionTrace));
  for (const who of peers) {
    try {
      await capture(who, `failure-${who.label}`);
    } catch {}
  }
  process.exitCode = 1;
  console.error(`Browser verification stopped after: ${report.failure.afterCheck}.`);
  console.error(report.failure.message);
  if (frame) {
    console.error(frame);
  }
} finally {
  /* Read before the browsers close, whose teardown closes every socket still open, so a failed wait still shows the socket that closed late. */
  if (signOut) {
    report.signOut = signOutReport();
    console.log(`SIGNOUT ${JSON.stringify(report.signOut)}`);
  }
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
  /* Pages keep logging until their browser closes (#1258), so the listeners' arrays are read only after that. */
  for (const instance of [...otherBrowsers, browser]) {
    try {
      await instance.close();
    } catch (error) {
      /* A teardown error is recorded, but it neither replaces the flow's own result nor stops the report. */
      report.teardownErrors.push(redactSecrets(error?.message ?? error).slice(0, 200));
      console.error(`Browser teardown failed: ${report.teardownErrors.at(-1)}`);
    }
  }
  const redacted = (entries) => entries.map(({ label, message }) => ({ label, message: redactSecrets(message) }));
  report.pageErrorCount = report.pageErrors.length;
  report.pageErrors = redacted(report.pageErrors);
  report.consoleErrorCount = report.consoleErrors.length;
  report.consoleErrors = redacted(report.consoleErrors);
  report.blockedNetworkRequests = blockedNetwork.length;
  if (flow.keepsFrames) {
    await writeFile(
      new URL(`${values.flow}-frames.json`, directory),
      JSON.stringify(
        peers.map((who) => ({ label: who.label, frames: who.rawMessages })),
        null,
        2
      )
    );
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL('report.json', directory), JSON.stringify(report, null, 2));
  console.log(`REPORT ${new URL('report.json', directory).pathname}`);
}
