import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import WebSocket from 'ws';

import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import { browsers } from './browsers.mjs';
import { cpuProfile } from './cpu.mjs';
import { captureSource, prepareDirectory } from './files.mjs';
import { measurements } from './measurements.mjs';
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
  },
});
assert.ok(['baseline', 'stacked', 'separated'].includes(values.profile));
assert.ok(['probe', 'peak', 'reconnect', 'trace', 'multitab', 'steady', 'slow', 'browser'].includes(values.case));
assert.ok(values.origin && values['report-dir']);
assert.ok(['on', 'off'].includes(values.compression));
assert.ok(values.case !== 'browser' || values.compression === 'on', 'Browser compression uses browser negotiation.');
const local = {
  CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL,
  CONVEX_SELF_HOSTED_ADMIN_KEY: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
};
assert.ok(local.CONVEX_SELF_HOSTED_URL && local.CONVEX_SELF_HOSTED_ADMIN_KEY);
const origin = new URL(values.origin);
const backend = new URL(local.CONVEX_SELF_HOSTED_URL);
for (const url of [origin, backend]) {
  assert.equal(url.href, `http://127.0.0.1:${url.port}/`, 'Only explicit isolated loopback origins are accepted.');
  assert.ok(url.port);
}
const directory = await prepareDirectory(values['report-dir']);
const source = await captureSource(directory);
const manifestText = await readFile(new URL('../../src/shared/play/loadWorkload.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestText);
const maxBytes = Number(values['max-bytes'] ?? manifest.probe.maxApplicationBytes);
assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0);
assert.ok(
  values.case !== 'probe' || maxBytes === manifest.probe.maxApplicationBytes,
  'The sizing probe retains its agreed byte limit.'
);
const repetition = Number(values.repetition);
assert.ok(Number.isInteger(repetition) && repetition >= 1 && repetition <= manifest.repetitions);
const seed = Number(values.seed ?? manifest.seed + repetition - 1);
assert.ok(Number.isSafeInteger(seed));
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
  environment: { origin: origin.origin, backend: backend.origin, kind: 'synthetic-loopback' },
  clock:
    'One coordinator uses performance.now for source dispatch and recipient projection application; process scheduling and parsing are included.',
  bounds: {
    warmupSeconds,
    measuredSeconds,
    maxApplicationBytes: maxBytes,
    wallSeconds: Math.max(240, warmupSeconds + measuredSeconds + 120),
  },
  limitations: [
    'Local timing is not hosted latency.',
    'Synthetic public content excludes private mechanics and catalogue image acceptance.',
    'Protocol recipients do not measure browser rendering.',
  ],
  bytes: { sent: 0, received: 0 },
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
const durableSamples = [];
const timing = measurements(path.join(directory, 'observations.ndjson'), stop);
let stopping = false;
let stopReason;
let game;
let link;
let browserRun;
let cpu;
let samplePhase = 'preparation';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function stop(reason) {
  if (stopping) {
    return;
  }
  stopping = true;
  stopReason = reason;
  for (const peer of peers) {
    peer.socket?.terminate();
  }
}
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
const admin = new ConvexHttpClient(backend.origin, { logger: false });
admin.setAdminAuth(local.CONVEX_SELF_HOSTED_ADMIN_KEY);
async function user(index) {
  const client = new ConvexHttpClient(backend.origin, { logger: false });
  const email = `load-${index}-${randomBytes(6).toString('hex')}@example.invalid`;
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
function apply(peer, message) {
  if (message.type === 'update') {
    if (peer.resyncing) {
      return;
    }
    const view = applyRoomUpdate(peer.view, message);
    if (!view) {
      report.resyncs++;
      peer.resyncing = true;
      if (!peer.browser) {
        send(peer, { type: 'sync' });
      }
      return;
    }
    message = view;
  }
  applyResponse(peer, message);
  if (!['view', 'activity'].includes(message.type)) {
    return;
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
  const socketOrigin = peer.slow ? link.origin : origin.origin;
  const socket = new WebSocket(`${socketOrigin.replace('http:', 'ws:')}/__play/games/${game.gameId}/socket`, {
    origin: origin.origin,
    ...(peer.slow ? { headers: { Host: origin.host } } : {}),
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
async function record(peer, message, operation) {
  report.actions.offered++;
  const counts = (report.actions.byOperation[operation] ??= { offered: 0, accepted: 0, rejected: 0, failed: 0 });
  counts.offered++;
  const at = performance.now();
  const phase = samplePhase;
  try {
    peer.responses.delete(message.commandId);
    send(peer, message);
    const result = await until(() => peer.responses.get(message.commandId), `Command ${message.commandId} timed out.`);
    if (result.type === 'rejected') {
      counts.rejected++;
      report.actions.rejected++;
      throw new Error(result.message);
    }
    report.actions.accepted++;
    counts.accepted++;
    durableSamples.push(performance.now() - at);
    report.actionTimings ??= [];
    report.actionTimings.push({ operation, phase, peer: peer.index, ms: performance.now() - at });
    return { message, result };
  } catch (error) {
    if (peer.responses.get(message.commandId)?.type !== 'rejected') {
      report.actions.failed++;
      counts.failed++;
    }
    throw error;
  }
}
async function durable(peer, action, operation = action.kind) {
  return record(
    peer,
    { type: 'command', commandId: randomUUID(), action, expectedRevision: peer.view.snapshot.revision },
    operation
  );
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
function percentile(values, fraction) {
  return values.length
    ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
    : null;
}
function distribution(values) {
  return {
    samples: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? values.reduce((maximum, value) => Math.max(maximum, value), 0) : null,
  };
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
        }
      },
    });
  }
  game = await admin.mutation(anyApi.playTesting.createFixture, {
    ...(values.profile === 'baseline' ? {} : { loadProfile: values.profile }),
    ...(browserRun ? { useHostedRoute: true } : {}),
  });
  const provision = await fetch(`${origin.origin}/__play/games/${game.gameId}/provision`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
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
    assert.deepEqual(peer.view.snapshot, replay.snapshot);
  }
  report.checks.push('A repeated command applies once and every recipient receives the same durable snapshot.');
  const trace =
    values.profile !== 'baseline' && values.case !== 'reconnect'
      ? await createTrace({
          peer: peers.find((peer) => peer.role === 'secondary' && !peer.browser),
          request,
          durable,
          record,
          seed,
          operations: manifest.durableTrace,
        })
      : undefined;
  const metricsStart = await request(first, { type: 'metrics' }, 'metrics');
  report.serverBefore = metricsStart;
  if (values['profile-cpu']) {
    cpu = await cpuProfile(Number(values['worker-pid']), directory);
  }
  if (values.case === 'trace') {
    assert.ok(trace, 'The complete synthetic trace needs an expanded profile.');
    const started = performance.now();
    for (let index = 0; index < trace.operations.length * 2; index++) {
      await delay(Math.max(0, started + (index * 1000) / manifest.durableActionsPerSecond - performance.now()));
      await trace.step(index);
    }
    const final = first.view.snapshot;
    await until(
      () => peers.every((peer) => peer.view.snapshot.revision === final.revision),
      'Trace recipients did not converge.'
    );
    for (const peer of peers) {
      assert.deepEqual(peer.view.snapshot, final);
    }
    assert.deepEqual(final.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort(), itemIds);
    report.checks.push('Two complete action cycles preserve every item and converge on every recipient.');
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
    let group = -1;
    const selectMovers = async (round) => {
      for (const peer of movers) {
        send(peer, { type: 'cancel', carryId: peer.carryId });
      }
      const previousIds = new Set(movers.map((peer) => peer.carryId));
      await until(
        () => players.every((peer) => !peer.activity?.carries.some((carry) => previousIds.has(carry.id))),
        'The previous mover group did not release its carries.'
      );
      movers = Array.from({ length: moverCount }, (_, index) => players[(round * moverCount + index) % players.length]);
      for (let index = 0; index < movers.length; index++) {
        const peer = movers[index];
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
      }
      group = round;
      report.moverGroups ??= [];
      report.moverGroups.push({ round, peers: movers.map((peer) => peer.index) });
    };
    await selectMovers(0);
    report.checks.push(`${movers.length} different players carry different pieces concurrently.`);
    report.resourcesBefore = processResources();
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
        transport:
          'Loopback TCP proxy with pipelined delay in both directions and a capped downlink. Wire bytes include WebSocket compression; OS-level packet loss and TCP retransmissions are not simulated.',
      };
    }
    let actionFailure;
    const actionWork = (async () => {
      let offered = 0;
      while (!stopping && performance.now() - measuredAt < duration) {
        const due = measuredAt + (offered * 1000) / manifest.durableActionsPerSecond;
        if (performance.now() < due) {
          await delay(due - performance.now());
        }
        if (stopping || performance.now() - measuredAt >= duration) {
          break;
        }
        samplePhase = performance.now() - measuredAt < warmupSeconds * 1000 ? 'warmup' : 'measured';
        if (trace && values.case !== 'peak') {
          await trace.step(offered);
        } else {
          await durable(
            first,
            offered % 2 === 0
              ? { kind: 'rotate', pieceId: snapshot.table.pieces.at(-1).id, direction: 1 }
              : { kind: 'flip', pieceId: snapshot.table.pieces.at(-1).id }
          );
        }
        offered++;
      }
    })().catch((error) => {
      actionFailure = error;
    });
    let seq = 0;
    while (!stopping && performance.now() - measuredAt < duration) {
      const interval = 1000 / manifest.pointerHz;
      const due = measuredAt + seq * interval;
      if (performance.now() < due) {
        await delay(due - performance.now());
      }
      if (stopping) {
        break;
      }
      const current = Math.floor((performance.now() - measuredAt) / interval);
      report.coalescedInputs += Math.max(0, current - seq) * movers.length * 2;
      seq = Math.max(seq, current);
      if (performance.now() - measuredAt >= duration) {
        break;
      }
      const nextGroup =
        values.case === 'peak'
          ? 0
          : Math.floor((performance.now() - measuredAt) / (manifest.moverRotationSeconds * 1000));
      if (nextGroup !== group) {
        await selectMovers(nextGroup);
      }
      samplePhase = performance.now() - measuredAt < warmupSeconds * 1000 ? 'warmup' : 'measured';
      for (let index = 0; index < movers.length; index++) {
        const peer = movers[index];
        const position = [-5 + index * 0.5, 1.5 + Math.sin((seq + seed) / 20) * 0.1, 4];
        for (const kind of ['pointer', 'pose']) {
          const sample = {
            phase: samplePhase,
            at: performance.now(),
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
        }
      }
      seq++;
    }
    report.motionRunMs = performance.now() - measuredAt;
    report.measuredMs = Math.max(0, report.motionRunMs - warmupSeconds * 1000);
    report.resourcesAfter = processResources();
    await actionWork;
    if (actionFailure && !stopping) {
      throw actionFailure;
    }
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
      await delay(1000);
      for (const peer of movers) {
        send(peer, { type: 'cancel', carryId: peer.carryId });
      }
    }
  }
  if (!stopping) {
    report.serverAfter = await request(first, { type: 'metrics' }, 'metrics');
    report.status = 'smoke-complete';
  } else {
    report.status = 'incomplete';
  }
} catch (error) {
  report.status = stopping ? 'incomplete' : 'failed';
  report.error = error.message;
} finally {
  if (cpu) {
    try {
      report.cpu = await cpu.finish();
    } catch (error) {
      report.cpu = { error: error.message };
      report.status = 'failed';
    }
  }
  report.stopReason = stopReason ?? (report.status === 'failed' ? 'failed' : 'completed');
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
    report.slowLink = link.totals;
  }
  clearTimeout(hardStop);
  process.removeListener('SIGINT', interrupted);
  process.removeListener('SIGTERM', interrupted);
  if (game) {
    try {
      await admin.mutation(anyApi.playTesting.retireFixture, { gameId: game.gameId });
      report.cleanup = 'Fixture retired; stack owner removes its disposable storage.';
    } catch {
      report.cleanup = 'Fixture retirement failed; disposable stack teardown is required.';
    }
  }
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
  report.perClient = peers.map((p) => ({
    peer: p.index,
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
