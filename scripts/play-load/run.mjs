import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import WebSocket from 'ws';

import { loadCaseSchema } from '../../src/shared/play/loadTarget.ts';
import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import { browsers } from './browsers.mjs';
import { cpuProfile } from './cpu.mjs';
import { captureSource, prepareDirectory } from './files.mjs';
import { openHostedSession } from './hosted-session.mjs';
import { interactions } from './interactions.mjs';
import { distribution, measurements } from './measurements.mjs';
import { runMotionSchedule } from './motion.mjs';
import { runActionSchedule } from './pacing.mjs';
import { slowLink } from './slow-link.mjs';
import { createTrace } from './trace.mjs';

const { values } = parseArgs({
  options: {
    origin: { type: 'string' },
    profile: { type: 'string', default: 'stacked' },
    case: { type: 'string', default: 'probe' },
    'report-dir': { type: 'string' },
    seed: { type: 'string' },
    'worker-pid': { type: 'string' },
    'profile-cpu': { type: 'boolean', default: false },
    compression: { type: 'string', default: 'on' },
    'backend-pid': { type: 'string' },
    'max-bytes': { type: 'string' },
    repetition: { type: 'string', default: '1' },
    'hosted-run': { type: 'string' },
  },
});
assert.ok(['baseline', 'stacked', 'separated'].includes(values.profile));
assert.ok(loadCaseSchema.options.includes(values.case));
assert.ok(values.origin && values['report-dir']);
assert.ok(['on', 'off'].includes(values.compression));
assert.ok(values.case !== 'browser' || values.compression === 'on', 'Browser compression uses browser negotiation.');
const local = {
  CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL,
  CONVEX_SELF_HOSTED_ADMIN_KEY: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
};
const hosted = values['hosted-run'] ? await openHostedSession(values['hosted-run'], values) : null;
assert.ok(hosted || (local.CONVEX_SELF_HOSTED_URL && local.CONVEX_SELF_HOSTED_ADMIN_KEY));
const origin = new URL(values.origin);
const backend = new URL(hosted?.target.backendOrigin ?? local.CONVEX_SELF_HOSTED_URL);
for (const url of hosted ? [] : [origin, backend]) {
  assert.equal(url.href, `http://127.0.0.1:${url.port}/`, 'Only explicit isolated loopback origins are accepted.');
  assert.ok(url.port);
}
const directory = await prepareDirectory(values['report-dir']);
const source = await captureSource(directory);
const manifestText = await readFile(new URL('../../src/shared/play/loadWorkload.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestText);
const maxBytes = hosted?.cell.maxApplicationBytes ?? Number(values['max-bytes'] ?? manifest.probe.maxApplicationBytes);
assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0);
assert.ok(
  values.case !== 'probe' || maxBytes === manifest.probe.maxApplicationBytes,
  'The sizing probe retains its agreed byte limit.'
);
const repetition = Number(values.repetition);
assert.ok(Number.isInteger(repetition) && repetition >= 1 && repetition <= manifest.repetitions);
const seed = Number(values.seed ?? manifest.seed + repetition - 1);
assert.ok(Number.isSafeInteger(seed));
/**
 * Client geography and edge placement come from the edge's own trace, without the client address.
 * The origin is the validated target record's, which the session already matched against the argument.
 */
async function placement() {
  const limitation =
    'The edge location serving the coordinator, not the Durable Object placement, which the provider does not expose here.';
  try {
    const response = await fetch(`${hosted.target.applicationOrigin}/cdn-cgi/trace`, {
      signal: AbortSignal.timeout(15_000),
    });
    const fields = Object.fromEntries(
      (await response.text())
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => line.split('=', 2))
    );
    return {
      clientCountry: fields.loc ?? null,
      edgeColo: fields.colo ?? null,
      controllerEdgeColo: hosted.initial.edgeColo,
      http: fields.http ?? null,
      tls: fields.tls ?? null,
      limitation,
    };
  } catch (error) {
    return { error: error.message, controllerEdgeColo: hosted.initial.edgeColo, limitation };
  }
}
const warmupSeconds = values.case === 'steady' ? manifest.warmupSeconds : 0;
const measuredSeconds =
  { steady: manifest.measuredSeconds, slow: manifest.slowObserver.seconds }[values.case] ?? manifest.probe.seconds;
const report = {
  status: 'running',
  profile: values.profile,
  case: values.case,
  seed,
  repetition,
  sourceRevision: source.revision,
  workingTreeDiffSha256: createHash('sha256').update(source.trackedDiff).digest('hex'),
  untrackedSourceSha256: createHash('sha256').update(JSON.stringify(source.untrackedSources)).digest('hex'),
  manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
  environment: {
    origin: origin.origin,
    backend: backend.origin,
    kind: hosted ? 'synthetic-hosted' : 'synthetic-loopback',
    ...(hosted ? { target: hosted.target, run: hosted.run, cell: hosted.cell, placement: await placement() } : {}),
  },
  clock:
    'One coordinator uses performance.now for source dispatch and recipient projection application; process scheduling and parsing are included.',
  bounds: {
    warmupSeconds,
    measuredSeconds,
    maxApplicationBytes: maxBytes,
    finalObservationMs: 5000,
    wallSeconds: Math.max(240, warmupSeconds + measuredSeconds + 120),
  },
  limitations: [
    hosted
      ? 'Hosted timing includes the coordinator network path; fixture budget reservations add storage overhead.'
      : 'Local timing is not hosted latency.',
    'Synthetic public content excludes private mechanics and catalogue image acceptance.',
    'Protocol recipients do not measure browser rendering.',
  ],
  bytes: { sent: 0, received: 0 },
  sentMessages: 0,
  deliveries: 0,
  compression: values.compression,
  resyncs: 0,
  transmittedMotion: 0,
  coalescedInputs: 0,
  actions: { offered: 0, accepted: 0, rejected: 0, failed: 0, byOperation: {} },
  admissionAttempts: [],
  reconnects: [],
  rejections: [],
  checks: [],
};
const peers = [];
const operations = new AbortController();
const durableSamples = [];
const interactionTiming = interactions(peers);
const timing = measurements(path.join(directory, 'observations.ndjson'), stop, peers);
let stopping = false;
let stopReason;
let game;
let link;
let browserRun;
let cpu;
let actionWork;
let samplePhase = 'preparation';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function stop(reason) {
  if (stopping) {
    return;
  }
  stopping = true;
  operations.abort();
  stopReason = reason;
  for (const peer of peers) {
    peer.socket?.terminate();
  }
}
hosted?.assertWindow(report.bounds.wallSeconds);
const hardStop = setTimeout(() => stop('wall-budget'), report.bounds.wallSeconds * 1000);
const interrupted = () => stop('operator-stop');
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);
function accountBytes(direction, bytes) {
  report.bytes[direction] += bytes;
  if (report.bytes.sent + report.bytes.received >= report.bounds.maxApplicationBytes) {
    stop('byte-budget');
  }
}
async function until(predicate, label, timeout = 15_000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (stopping) {
      throw new Error(stopReason);
    }
    const value = predicate();
    if (value) {
      return value;
    }
    await delay(10);
  }
  throw new Error(label);
}
const clientOptions = {
  logger: false,
  fetch: (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.any([operations.signal, AbortSignal.timeout(15_000)]) }),
};
const admin = new ConvexHttpClient(backend.origin, clientOptions);
admin.setAdminAuth(hosted?.key ?? local.CONVEX_SELF_HOSTED_ADMIN_KEY);
async function user(index) {
  const client = new ConvexHttpClient(backend.origin, clientOptions);
  const suffix = hosted?.run.runId ?? process.env.PLAY_LOAD_LOCAL_ACCOUNT_SUFFIX ?? randomBytes(6).toString('hex');
  const email = `load-${index}-${suffix}@example.invalid`;
  const password = randomBytes(24).toString('hex');
  const result = await client.action(anyApi.auth.signIn, {
    provider: 'password',
    params: {
      flow: 'signUp',
      email,
      password,
    },
  });
  assert.ok(result.tokens?.token);
  client.setAuth(result.tokens.token);
  return { client, index, email, password };
}
function send(peer, message) {
  if (stopping) {
    return false;
  }
  const text = JSON.stringify(message);
  if (report.bytes.sent + report.bytes.received + Buffer.byteLength(text) >= report.bounds.maxApplicationBytes) {
    stop('byte-budget');
    return false;
  }
  assert.equal(peer.socket.readyState, WebSocket.OPEN);
  peer.socket.send(text);
  report.sentMessages++;
  accountBytes('sent', Buffer.byteLength(text));
  peer.sentBytes = (peer.sentBytes ?? 0) + Buffer.byteLength(text);
  return true;
}
function applyResponse(peer, message) {
  if (message.type === 'view') {
    peer.view = message;
    peer.authorized = true;
    peer.resyncing = false;
    if (message.updates === 2 && !peer.compact && !peer.browser) {
      peer.compact = true;
      send(peer, { type: 'sync' });
    }
  }
  if (message.type === 'admission') {
    peer.authorized = false;
  }
  if (message.type === 'rejected') {
    report.rejections.push({ peer: peer.index, requestId: message.requestId, message: message.message });
  }
  const key = message.completedCommandId ?? message.requestId ?? message.carryId;
  if (key) {
    peer.responses.set(key, message);
  }
  if (message.type === 'metrics') {
    peer.responses.set('metrics', message);
  }
}
function hydrateUpdate(peer, message) {
  if (message.type !== 'update') {
    return message;
  }
  if (peer.resyncing) {
    return null;
  }
  const view = applyRoomUpdate(peer.view, message);
  if (view) {
    return view;
  }
  report.resyncs++;
  peer.resyncing = true;
  if (!peer.browser) {
    send(peer, { type: 'sync' });
  }
  return null;
}
function apply(peer, packet) {
  const message = hydrateUpdate(peer, packet);
  if (!message) {
    return;
  }
  applyResponse(peer, message);
  if (!['view', 'activity'].includes(message.type)) {
    return;
  }
  if (message.type === 'view') {
    interactionTiming.observe(peer, message.snapshot.revision);
  }
  peer.activity = message;
  for (const entry of message.pointers) {
    timing.observe(peer, 'pointer', entry);
  }
  for (const entry of message.carries) {
    timing.observe(peer, 'pose', entry);
  }
}
function receivePacket(peer, raw) {
  accountBytes('received', raw.byteLength);
  report.deliveries++;
  peer.receivedBytes = (peer.receivedBytes ?? 0) + raw.byteLength;
  if (stopping) {
    return;
  }
  const message = JSON.parse(raw.toString());
  peer.messagesByType ??= Object.create(null);
  const counts = (peer.messagesByType[message.type] ??= { deliveries: 0, bytes: 0, maxBytes: 0 });
  counts.deliveries++;
  counts.bytes += raw.byteLength;
  counts.maxBytes = Math.max(counts.maxBytes, raw.byteLength);
  apply(peer, message);
}
async function drainMotion(movers, boundary) {
  if (!movers.length) {
    return;
  }
  const sources = new Set(movers.map((peer) => peer.index));
  const started = performance.now();
  try {
    await until(
      () => timing.outstanding(sources).length === 0,
      'Final motion did not reach every expected recipient before cancellation.',
      report.bounds.finalObservationMs
    );
  } finally {
    report.motionDrains ??= [];
    report.motionDrains.push({
      boundary,
      sources: [...sources],
      ms: performance.now() - started,
      outstanding: timing.outstanding(sources),
    });
  }
}
async function issueTicket(peer, attempt, simultaneous) {
  let issued;
  try {
    issued = await peer.user.client.mutation(anyApi.playAdmission.issueTicket, { gameId: game.gameId });
  } catch (error) {
    report.admissionAttempts.push({
      peer: peer.index,
      attempt,
      result: 'ticket-error',
      message: error.message,
      simultaneous,
      retryAfterMs: 1000,
    });
    await delay(1000);
    return null;
  }
  if (issued.ok) {
    return issued;
  }
  const retryAfterMs = Math.max(1000, issued.retryAfterMs ?? 1000);
  report.admissionAttempts.push({ peer: peer.index, attempt, result: issued.reason, simultaneous, retryAfterMs });
  await delay(retryAfterMs);
  return null;
}
async function openSocket(peer, issued) {
  /* A slow peer reaches the origin through the loopback relay; a hosted origin keeps TLS end to end through it. */
  const socketOrigin = peer.slow ? link.origin.replace('http:', origin.protocol) : origin.origin;
  const socket = new WebSocket(`${socketOrigin.replace('http', 'ws')}/__play/games/${game.gameId}/socket`, {
    origin: origin.origin,
    perMessageDeflate: values.compression === 'on',
    ...(peer.slow ? { headers: { Host: origin.host }, servername: origin.hostname } : {}),
  });
  peer.socket = socket;
  peer.responses = new Map();
  peer.compact = false;
  peer.resyncing = false;
  socket.once('upgrade', (response) => {
    const transport = { socket: response.socket, extensions: null };
    (peer.transports ??= []).push(transport);
    socket.once('open', () => {
      transport.extensions = socket.extensions;
    });
  });
  socket.on('error', () => {});
  socket.on('message', (raw) => receivePacket(peer, raw));
  await new Promise((resolve) => {
    socket.once('open', resolve);
    socket.once('error', resolve);
  });
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  if (values.compression === 'off' && socket.extensions) {
    throw new Error('The compression-off connection negotiated a WebSocket extension.');
  }
  send(peer, { type: 'admit', ticket: issued.ticket });
  await until(() => peer.view || socket.readyState !== WebSocket.OPEN, 'Admission did not settle.', 7000).catch(
    () => {}
  );
  return Boolean(peer.view);
}
async function connect(peer, simultaneous = false) {
  const started = performance.now();
  if (peer.browser) {
    await browserRun.connect(peer);
    await until(() => peer.view, 'The browser did not apply its authorized view.');
    return performance.now() - started;
  }
  peer.view = undefined;
  peer.authorized = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (stopping) {
      throw new Error(stopReason);
    }
    const issued = await issueTicket(peer, attempt, simultaneous);
    if (!issued) {
      continue;
    }
    const success = await openSocket(peer, issued);
    report.admissionAttempts.push({
      peer: peer.index,
      attempt,
      result: success ? 'admitted' : 'refused',
      simultaneous,
    });
    if (success) {
      return performance.now() - started;
    }
    peer.socket.terminate();
    await delay(1000);
  }
  throw new Error(`Peer ${peer.index} exhausted admission attempts.`);
}
async function request(peer, message, key) {
  peer.responses.delete(key);
  send(peer, message);
  const result = await until(() => peer.responses.get(key), `Request ${key} timed out.`);
  assert.notEqual(result.type, 'rejected', result.message);
  return result;
}
function beginInteraction(peer, operation, slot) {
  const sample = interactionTiming.begin({ peer, operation, phase: slot?.phase ?? samplePhase, ...slot });
  report.actions.offered++;
  const counts = (report.actions.byOperation[operation] ??= { offered: 0, accepted: 0, rejected: 0, failed: 0 });
  counts.offered++;
  return sample;
}
function failInteraction(sample, error, rejected = false) {
  if (sample.status) {
    return;
  }
  sample.status = rejected ? 'rejected' : 'failed';
  sample.error = error.message;
  report.actions[sample.status]++;
  report.actions.byOperation[sample.operation][sample.status]++;
}
async function record(peer, message, operation, sample = beginInteraction(peer, operation)) {
  try {
    peer.responses.delete(message.commandId);
    sample.commandSentAt = performance.now();
    assert.ok(send(peer, message), 'The saved command was stopped before dispatch.');
    const result = await until(() => peer.responses.get(message.commandId), `Command ${message.commandId} timed out.`);
    if (result.type === 'rejected') {
      const error = new Error(result.message);
      failInteraction(sample, error, true);
      throw error;
    }
    interactionTiming.confirm(sample, result.snapshot.revision);
    sample.status = 'accepted';
    report.actions.accepted++;
    report.actions.byOperation[operation].accepted++;
    const ms = sample.confirmedAt - sample.commandSentAt;
    durableSamples.push(ms);
    report.actionTimings ??= [];
    report.actionTimings.push({ operation, phase: sample.phase, peer: peer.index, ms });
    return { message, result };
  } catch (error) {
    failInteraction(sample, error);
    throw error;
  }
}
async function durable(peer, action, operation = action.kind, sample) {
  return record(
    peer,
    { type: 'command', commandId: randomUUID(), action, expectedRevision: peer.view.snapshot.revision },
    operation,
    sample
  );
}

/* Every recipient receives the same public snapshot; the bank, hand and battle plan are projected per viewer. */
const perViewerFields = new Set(['bank', 'hand', 'battlePlan']);
function publicFixtureSnapshot(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => !perViewerFields.has(key)));
}
function processResources() {
  const output = execFileSync('/bin/ps', ['-ax', '-o', 'pid=,ppid=,time=,rss='], { encoding: 'utf8' });
  const rows = output
    .trim()
    .split('\n')
    .map((line) => {
      const [pid, parent, time, rss] = line.trim().split(/\s+/);
      const parts = time.split(':').map(Number);
      return {
        pid: Number(pid),
        parent: Number(parent),
        cpuSeconds: parts.reduce((sum, part) => sum * 60 + part, 0),
        rssKiB: Number(rss),
      };
    });
  return ['worker-pid', 'backend-pid'].map((name) => {
    const descendants = new Set([Number(values[name])]);
    while (true) {
      const size = descendants.size;
      for (const row of rows) {
        if (descendants.has(row.parent)) {
          descendants.add(row.pid);
        }
      }
      if (descendants.size === size) {
        break;
      }
    }
    return { group: name, processes: rows.filter((row) => descendants.has(row.pid)) };
  });
}

try {
  if (values.case === 'browser') {
    browserRun = await browsers({
      origin: origin.origin,
      backend: backend.origin,
      directory,
      stopping: () => stopping,
      onMessage: apply,
      onBytes: (peer, direction, size) => {
        accountBytes(direction, size);
        const key = direction === 'sent' ? 'sentBytes' : 'receivedBytes';
        peer[key] = (peer[key] ?? 0) + size;
        if (direction === 'received') {
          report.deliveries++;
        } else {
          report.sentMessages++;
        }
      },
    });
  }
  game =
    hosted?.game ??
    (await admin.mutation(anyApi.playTesting.createFixture, {
      ...(values.profile === 'baseline' ? {} : { loadProfile: values.profile }),
      ...(browserRun ? { useHostedRoute: true } : {}),
    }));
  const provision = await fetch(`${origin.origin}/__play/games/${game.gameId}/provision`, {
    method: 'POST',
    signal: AbortSignal.any([operations.signal, AbortSignal.timeout(30_000)]),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: game.gameId, secret: game.secret, attemptId: game.attemptId }),
  });
  assert.equal(provision.status, 200);
  const playerCount = values.profile === 'baseline' ? 2 : manifest.players;
  const observerCount = values.profile === 'baseline' ? 1 : manifest.observers;
  const secondaryCount = values.profile === 'baseline' ? 1 : manifest.secondaryTabs;
  const users = [];
  if (values.case === 'slow') {
    link = await slowLink(origin, manifest.slowObserver);
  }
  for (let index = 0; index < playerCount + observerCount; index++) {
    users.push(await user(index));
    const peer = {
      index: peers.length,
      user: users[index],
      role: index < playerCount ? 'player' : 'observer',
      slow: Boolean(link && index === playerCount),
      browser: Boolean(browserRun && index === playerCount),
    };
    peers.push(peer);
    await connect(peer);
    await delay(100);
  }
  for (let index = 0; index < secondaryCount; index++) {
    const peer = {
      index: peers.length,
      user: users[index],
      role: 'secondary',
      browser: Boolean(browserRun && index === 0),
    };
    peers.push(peer);
    await connect(peer);
    await delay(100);
  }
  const players = peers.filter((p) => p.role === 'player');
  const snapshot = players[0].view.snapshot;
  assert.equal(new Set(players.map((p) => p.view.viewer.userId)).size, playerCount);
  assert.equal(new Set(players.map((p) => p.view.viewer.viewerSeat)).size, playerCount);
  for (const peer of peers.filter((p) => p.role === 'observer')) {
    assert.equal(peer.view.viewer.viewerSeat, 'neutral');
  }
  for (const peer of peers.filter((p) => p.role === 'secondary')) {
    assert.equal(peer.view.viewer.viewerSeat, players[peer.user.index].view.viewer.viewerSeat);
  }
  const itemIds = snapshot.table.pieces.flatMap((p) => p.items.map((i) => i.id)).sort();
  assert.equal(itemIds.length, values.profile === 'baseline' ? 17 : 750);
  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(snapshot.table.pieces.length, { baseline: 6, stacked: 294, separated: 750 }[values.profile]);
  report.roles = peers.map((p) => ({
    peer: p.index,
    role: p.role,
    seat: p.view.viewer.viewerSeat,
    identity: p.user.index,
  }));
  report.checks.push(
    'Distinct seated identities, observer permissions and shared secondary-tab seats match the workload.'
  );
  const first = players[0];
  const rotated = await durable(first, { kind: 'rotate', pieceId: snapshot.table.pieces.at(-1).id, direction: 1 });
  const revision = rotated.result.snapshot.revision;
  const replay = await request(first, rotated.message, rotated.message.commandId);
  assert.equal(replay.snapshot.revision, revision);
  await until(() => peers.every((p) => p.view.snapshot.revision === revision), 'Durable snapshots did not converge.');
  for (const peer of peers) {
    assert.deepEqual(publicFixtureSnapshot(peer.view.snapshot), publicFixtureSnapshot(replay.snapshot));
  }
  report.checks.push('A repeated command applies once and every recipient receives the same public durable snapshot.');
  const actionPeer = peers.find((peer) => peer.role === 'secondary' && !peer.browser);
  const trace =
    values.profile !== 'baseline' && values.case !== 'reconnect'
      ? await createTrace({
          peer: actionPeer,
          request,
          durable,
          record,
          seed,
          operations: manifest.durableTrace,
        })
      : undefined;
  const scheduleActions = async (startedAt, durationMs) => {
    let nextStep = 0;
    report.actionScheduleSlots = [];
    const result = await runActionSchedule({
      startedAt,
      durationMs,
      rate: manifest.durableActionsPerSecond,
      stopping: () => stopping,
      onSlot: (slot) => report.actionScheduleSlots.push(slot),
      step: async (slot) => {
        const useTrace = trace && values.case !== 'peak';
        const operation = useTrace
          ? trace.operations[nextStep % trace.operations.length]
          : nextStep % 2
            ? 'flip'
            : 'rotate';
        const peer = useTrace ? actionPeer : first;
        const sample = beginInteraction(peer, operation, {
          ...slot,
          phase: slot.scheduledAt - startedAt < warmupSeconds * 1000 ? 'warmup' : 'measured',
        });
        try {
          if (useTrace) {
            await trace.step(nextStep, sample);
          } else {
            await durable(
              peer,
              {
                kind: operation,
                pieceId: snapshot.table.pieces.at(-1).id,
                ...(operation === 'rotate' ? { direction: 1 } : {}),
              },
              operation,
              sample
            );
          }
          nextStep++;
        } catch (error) {
          failInteraction(sample, error);
          throw error;
        }
      },
    });
    report.actions.schedule = result;
    if (trace) {
      report.actions.completedTraceCycles = Math.floor(nextStep / trace.operations.length);
    }
    report.actions.scheduledMotionRun = result.scheduled;
    if (result.status === 'failed') {
      report.workloadFailure =
        result.failed ?? `${result.skipped} scheduled actions could not be dispatched at the agreed cadence.`;
    }
  };
  const metricsStart = await request(first, { type: 'metrics' }, 'metrics');
  report.serverBefore = metricsStart;
  if (values['profile-cpu']) {
    cpu = await cpuProfile(Number(values['worker-pid']), directory);
  }
  if (values.case === 'trace') {
    assert.ok(trace, 'The complete synthetic trace needs an expanded profile.');
    const started = performance.now();
    await scheduleActions(started, (trace.operations.length * 2 * 1000) / manifest.durableActionsPerSecond);
    const final = first.view.snapshot;
    await until(
      () => peers.every((peer) => peer.view.snapshot.revision === final.revision),
      'Trace recipients did not converge.'
    );
    for (const peer of peers) {
      assert.deepEqual(publicFixtureSnapshot(peer.view.snapshot), publicFixtureSnapshot(final));
    }
    assert.deepEqual(final.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort(), itemIds);
    report.checks.push('The dispatched trace preserves every item and public snapshots converge on every recipient.');
  } else if (values.case === 'multitab') {
    for (const secondary of peers.filter((peer) => peer.role === 'secondary')) {
      const primary = players[secondary.user.index];
      for (const peer of [primary, secondary]) {
        const piece = peer.view.snapshot.table.pieces.find(
          (candidate) => !candidate.items.some((item) => trace?.reservedItems.has(item.id))
        );
        const carryId = `tab-${peer.index}`;
        await request(
          peer,
          {
            type: 'begin',
            carryId,
            sourcePieceId: piece.id,
            expectedVersion: peer.view.snapshot.versions[piece.id],
            pickup: 'whole',
          },
          carryId
        );
        send(peer, { type: 'pose', carryId, seq: 0, position: [-2, 1, 3], orientation: 0 });
        await until(
          () => peers.every((recipient) => recipient.activity?.carries.some((carry) => carry.id === carryId)),
          'A tab gesture did not reach every recipient.'
        );
        send(peer, { type: 'cancel', carryId });
        await until(
          () => peers.every((recipient) => !recipient.activity?.carries.some((carry) => carry.id === carryId)),
          'A cancelled tab gesture remained visible.'
        );
      }
    }
    report.checks.push(
      'Every secondary tab and its primary tab independently carry and cancel through the shared seat.'
    );
  } else if (values.case === 'reconnect') {
    for (const count of values.profile === 'baseline' ? [1, peers.length] : manifest.reconnectCounts) {
      const selected = peers.slice(0, count);
      for (const peer of selected) {
        peer.socket.terminate();
      }
      await delay(manifest.networkInterruptionSeconds * 1000);
      const outcomes = await Promise.allSettled(
        selected.map(async (peer) => {
          const ms = await connect(peer, true);
          assert.equal(peer.view.snapshot.revision, revision);
          report.reconnects.push({ peer: peer.index, count, ms });
        })
      );
      const failures = outcomes.flatMap((outcome, index) =>
        outcome.status === 'rejected' ? [{ peer: selected[index].index, message: outcome.reason.message }] : []
      );
      report.reconnectFailures ??= [];
      report.reconnectFailures.push(...failures.map((failure) => ({ count, ...failure })));
      assert.equal(failures.length, 0, `${failures.length} of ${count} reconnects failed.`);
    }
  } else {
    const moverCount = Math.min(playerCount, values.case === 'peak' ? manifest.players : manifest.normalMovers);
    let movers = [];
    const selectMovers = async (round) => {
      const rotationStartedAt = performance.now();
      await drainMotion(movers, 'rotation');
      for (const peer of movers) {
        send(peer, { type: 'cancel', carryId: peer.carryId });
      }
      const previousIds = new Set(movers.map((peer) => peer.carryId));
      await until(
        () => players.every((peer) => !peer.activity?.carries.some((carry) => previousIds.has(carry.id))),
        'The previous mover group did not release its carries.'
      );
      movers = Array.from({ length: moverCount }, (_, index) => players[(round * moverCount + index) % players.length]);
      const admissions = await Promise.allSettled(
        movers.map(async (peer, index) => {
          peer.carryId = `load-${round}-${index}`;
          const piece = peer.view.snapshot.table.pieces.filter(
            (candidate) => !candidate.items.some((item) => trace?.reservedItems.has(item.id))
          )[index];
          await request(
            peer,
            {
              type: 'begin',
              carryId: peer.carryId,
              sourcePieceId: piece.id,
              expectedVersion: peer.view.snapshot.versions[piece.id],
              pickup: 'whole',
            },
            peer.carryId
          );
        })
      );
      const admissionFailures = admissions.filter((result) => result.status === 'rejected');
      assert.equal(admissionFailures.length, 0, admissionFailures.map((result) => result.reason.message).join('; '));
      report.moverGroups ??= [];
      report.moverGroups.push({
        round,
        peers: movers.map((peer) => peer.index),
        rotationStartedAt,
        activeAt: performance.now(),
        rotationMs: performance.now() - rotationStartedAt,
      });
    };
    await selectMovers(0);
    report.checks.push(`${movers.length} different players carry different pieces concurrently.`);
    report.resourcesBefore = hosted ? undefined : processResources();
    await browserRun?.start();
    report.bytesBeforeMotion = { ...report.bytes };
    const measuredAt = performance.now();
    const duration = (warmupSeconds + measuredSeconds) * 1000;
    report.actions.scheduledMotionRun = Math.ceil((duration * manifest.durableActionsPerSecond) / 1000);
    if (link) {
      link.constrain();
      report.slowObserver = {
        peer: peers.find((peer) => peer.slow).index,
        settings: manifest.slowObserver,
        transport: hosted
          ? 'Loopback TCP proxy with pipelined delay in both directions and a capped downlink, relaying the TLS stream to the isolated origin. Relay bytes include TLS framing and WebSocket compression; OS-level packet loss and TCP retransmissions are not simulated.'
          : 'Loopback TCP proxy with pipelined delay in both directions and a capped downlink. Wire bytes include WebSocket compression; OS-level packet loss and TCP retransmissions are not simulated.',
      };
    }
    actionWork = scheduleActions(measuredAt, duration);
    assert.equal(
      manifest.pointerHz,
      manifest.poseHz,
      'This runner schedules pointer and pose pairs at the same cadence.'
    );
    report.motionSchedule = await runMotionSchedule({
      startedAt: measuredAt,
      durationMs: duration,
      warmupMs: warmupSeconds * 1000,
      rate: manifest.pointerHz,
      rotationMs: values.case === 'peak' ? Infinity : manifest.moverRotationSeconds * 1000,
      players,
      moverCount,
      rotate: selectMovers,
      stopping: () => stopping,
      transmit: ({ peer, index, kind, seq, scheduledAt, phase }) => {
        samplePhase = phase;
        const position = [-5 + index * 0.5, 1.5 + Math.sin((seq + seed) / 20) * 0.1, 4];
        const sample = {
          phase,
          at: scheduledAt,
          dispatchedAt: performance.now(),
          source: peer.index,
          expected: new Set(peers.filter((p) => p !== peer).map((p) => p.index)),
          seen: new Set(),
        };
        const sent = send(
          peer,
          kind === 'pointer'
            ? { type: 'pointer', seq, position }
            : { type: 'pose', carryId: peer.carryId, seq, position, orientation: 0 }
        );
        if (sent) {
          timing.add(`${kind}/${peer.view.viewer.connectionId}/${seq}`, sample);
          report.transmittedMotion++;
        }
        return sent;
      },
    });
    report.coalescedInputs = report.motionSchedule.totals.coalesced;
    report.motionRunMs = report.motionSchedule.elapsedMs;
    report.measuredMs = Math.max(0, report.motionRunMs - warmupSeconds * 1000);
    if (report.motionSchedule.failure && !stopping) {
      throw new Error(report.motionSchedule.failure);
    }
    report.resourcesAfter = hosted ? undefined : processResources();
    await actionWork;
    if (link && !stopping) {
      const slow = peers.find((peer) => peer.slow);
      const at = performance.now();
      const revision = first.view.snapshot.revision;
      const finalActivity = first.activity;
      link.restore();
      await until(
        () =>
          slow.view.snapshot.revision === revision &&
          finalActivity.carries.every((carry) =>
            slow.activity?.carries.some(
              (candidate) => candidate.id === carry.id && candidate.sourceSeq >= carry.sourceSeq
            )
          ),
        'The slow observer did not catch up after network restoration.'
      );
      report.slowObserver.recoveryMs = performance.now() - at;
      report.slowObserver.restoredRevision = revision;
      report.slowObserver.finalCarriesRestored = true;
    }
    if (!stopping) {
      await drainMotion(movers, 'finish');
      for (const peer of movers) {
        send(peer, { type: 'cancel', carryId: peer.carryId });
      }
    }
  }
  if (!stopping) {
    report.serverAfter = await request(first, { type: 'metrics' }, 'metrics');
    await until(
      () => interactionTiming.outstanding().length === 0,
      'Saved interactions did not reach every recipient.',
      report.bounds.finalObservationMs
    );
    report.status = report.workloadFailure ? 'failed' : 'smoke-complete';
    if (report.workloadFailure) {
      report.error = report.workloadFailure;
    }
  } else {
    report.status = 'incomplete';
  }
} catch (error) {
  report.status = stopping ? 'incomplete' : 'failed';
  report.error = error.message;
} finally {
  const finalStopReason = stopReason ?? (report.status === 'failed' ? 'failed' : 'completed');
  stop('cleanup');
  await actionWork;
  if (cpu) {
    try {
      report.cpu = await cpu.finish();
    } catch (error) {
      report.cpu = { error: error.message };
      report.status = 'failed';
    }
  }
  report.stopReason = finalStopReason;
  report.byteLimitOvershoot = Math.max(
    0,
    report.bytes.sent + report.bytes.received - report.bounds.maxApplicationBytes
  );
  report.limitBoundary =
    'The coordinator terminates sockets at the byte threshold; already in-flight frames are counted as overshoot.';
  if (report.motionRunMs) {
    const before = report.bytesBeforeMotion;
    report.measuredApplicationBytes = report.bytes.sent + report.bytes.received - before.sent - before.received;
    report.applicationBytesPerSecond = report.measuredApplicationBytes / (report.motionRunMs / 1000);
    report.estimatedSteadyMatrixApplicationBytes =
      report.applicationBytesPerSecond *
      (manifest.warmupSeconds + manifest.measuredSeconds) *
      manifest.repetitions *
      manifest.profiles.length;
  }
  stop('cleanup');
  if (browserRun) {
    report.browsers = await browserRun.collect(peers);
    await browserRun.close();
  }
  if (link) {
    await link.close();
    report.slowLink = { ...link.totals, upstream: link.upstream };
  }
  if (hosted) {
    try {
      report.hostedCleanup = await hosted.stop();
      report.hostedStorageCleanup =
        'Game records removed and room stopped; the operator must remove the isolated backend and Workers.';
    } catch (error) {
      report.hostedCleanup = { error: String(error) };
      report.status = 'failed';
    }
  }
  if (game) {
    try {
      const cleanupClient = new ConvexHttpClient(backend.origin, {
        logger: false,
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
      });
      cleanupClient.setAdminAuth(hosted?.key ?? local.CONVEX_SELF_HOSTED_ADMIN_KEY);
      await cleanupClient.mutation(anyApi.playTesting.retireFixture, { gameId: game.gameId });
      report.cleanup = 'Fixture retired; stack owner removes its disposable storage.';
    } catch {
      report.cleanup = 'Fixture retirement failed; disposable stack teardown is required.';
    }
  }
  clearTimeout(hardStop);
  process.removeListener('SIGINT', interrupted);
  process.removeListener('SIGTERM', interrupted);
  Object.assign(report, await timing.finish());
  if (report.observationStorage.failure) {
    report.status = 'failed';
  }
  if (report.observationStorage.dropped && report.status !== 'failed') {
    report.status = 'incomplete';
  }
  if (report.actions.scheduledMotionRun !== undefined) {
    report.actions.completedMotionRun = (report.actionTimings ?? []).filter(
      (sample) => sample.phase !== 'preparation'
    ).length;
    report.actions.uncompletedMotionRun = Math.max(
      0,
      report.actions.scheduledMotionRun - report.actions.completedMotionRun
    );
  }
  report.durable = distribution(durableSamples);
  report.interactions = interactionTiming.finish();
  await writeFile(
    path.join(directory, 'interactions.ndjson'),
    report.interactions.rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
  );
  delete report.interactions.rows;
  report.perClient = peers.map((p) => ({
    peer: p.index,
    recipientClass: `${p.browser ? 'browser' : 'protocol'}-${p.role}`,
    sentBytes: p.sentBytes ?? 0,
    receivedBytes: p.receivedBytes ?? 0,
    messagesByType: p.messagesByType ?? {},
    transport: (p.transports ?? []).map(({ socket, extensions }) => ({
      extensions,
      receivedBytes: socket.bytesRead,
      sentBytes: socket.bytesWritten,
    })),
    ...timing.client(p.index),
  }));
  const assess = (summary, target, missing = 0) => ({
    ...summary,
    target,
    missing,
    status: missing
      ? 'incomplete'
      : !summary.samples
        ? 'not-measured'
        : summary.p95 > target
          ? 'failed'
          : 'within-target',
  });
  report.diagnosticTargets = {
    limitation: 'These per-client diagnostics do not establish hosted capacity or full-matrix acceptance.',
    motionAggregate: assess(
      report.motionByPhase.measured,
      manifest.targets.motionP95Ms,
      report.missingDeliveriesByPhase.measured
    ),
    motionByRecipientClass: Object.fromEntries(
      Object.entries(report.motionByRecipientClass).map(([name, summary]) => [
        name,
        assess(
          summary,
          manifest.targets.motionP95Ms,
          report.perClient
            .filter((peer) => peer.recipientClass === name)
            .reduce((sum, peer) => sum + peer.measuredMissingDeliveries, 0)
        ),
      ])
    ),
    motionByClient: report.perClient.map((peer) => ({
      peer: peer.peer,
      recipientClass: peer.recipientClass,
      ...assess(peer.measured, manifest.targets.motionP95Ms, peer.measuredMissingDeliveries),
    })),
    savedCommandConfirmation: assess(
      report.interactions.byPhase.measured.savedConfirmation,
      manifest.targets.durableP95Ms,
      report.interactions.byPhase.measured.missingConfirmations
    ),
    intentToConfirmation: assess(
      report.interactions.byPhase.measured.intentToConfirmation,
      manifest.targets.durableP95Ms,
      report.interactions.byPhase.measured.missingConfirmations
    ),
    reconnects: report.reconnects.map((sample) => ({
      ...sample,
      status: sample.ms <= manifest.targets.reconnectMs ? 'within-target' : 'failed',
    })),
  };
  const transports = report.perClient.flatMap((client) => client.transport);
  report.wire = {
    connections: transports.length,
    receivedBytes: transports.reduce((sum, connection) => sum + connection.receivedBytes, 0),
    sentBytes: transports.reduce((sum, connection) => sum + connection.sentBytes, 0),
    limitation:
      'Protocol connections only. TCP stream bytes include the HTTP upgrade and WebSocket framing and compression, but exclude TCP/IP headers, retransmissions and browser connections.',
  };
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      profile: report.profile,
      connections: peers.length,
      bytes: report.bytes,
      stopReason: report.stopReason,
      report: path.join(directory, 'report.json'),
    })
  );
  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}
