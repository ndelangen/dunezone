import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import WebSocket from 'ws';

const { values } = parseArgs({
  options: {
    'env-file': { type: 'string' },
    origin: { type: 'string' },
    profile: { type: 'string', default: 'stacked' },
    case: { type: 'string', default: 'probe' },
    'report-dir': { type: 'string' },
    seed: { type: 'string', default: '1105' },
    'worker-pid': { type: 'string' },
    'backend-pid': { type: 'string' },
  },
});
assert.ok(['baseline', 'stacked', 'separated'].includes(values.profile));
assert.ok(['probe', 'peak', 'reconnect'].includes(values.case));
assert.ok(values['env-file'] && values.origin && values['report-dir']);
const secretFile = path.resolve(values['env-file']);
assert.equal((await stat(secretFile)).mode & 0o077, 0, 'Credentials must be private.');
assert.equal((await stat(path.dirname(secretFile))).mode & 0o077, 0, 'The credentials directory must be private.');
const local = parseEnv(await readFile(secretFile, 'utf8'));
const origin = new URL(values.origin);
const backend = new URL(local.CONVEX_SELF_HOSTED_URL);
for (const url of [origin, backend]) {
  assert.equal(url.href, `http://127.0.0.1:${url.port}/`, 'Only explicit isolated loopback origins are accepted.');
  assert.ok(url.port);
}
const directory = path.resolve(values['report-dir']);
assert.ok(!secretFile.startsWith(`${directory}${path.sep}`), 'Secrets cannot be inside reports.');
await mkdir(directory, { recursive: true });
const manifestText = await readFile(new URL('../../src/shared/play/loadWorkload.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestText);
const seed = Number(values.seed);
assert.ok(Number.isSafeInteger(seed));
const report = {
  status: 'running',
  profile: values.profile,
  case: values.case,
  seed,
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDiffSha256: createHash('sha256')
    .update(execFileSync('git', ['diff', 'HEAD']))
    .digest('hex'),
  untrackedSourceSha256: createHash('sha256')
    .update(
      execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort()
        .map((file) => file + '\n' + readFileSync(file, 'utf8'))
        .join('\n')
    )
    .digest('hex'),
  manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
  environment: { origin: origin.origin, backend: backend.origin, kind: 'synthetic-loopback' },
  clock:
    'One coordinator uses performance.now for source dispatch and recipient projection application; process scheduling and parsing are included.',
  bounds: {
    measuredSeconds: manifest.probe.seconds,
    maxApplicationBytes: manifest.probe.maxApplicationBytes,
    wallSeconds: 240,
  },
  limitations: [
    'Local timing is not hosted latency.',
    'Synthetic public content excludes private mechanics and catalogue image acceptance.',
    'Protocol recipients do not measure browser rendering.',
  ],
  bytes: { sent: 0, received: 0 },
  deliveries: 0,
  transmittedMotion: 0,
  coalescedInputs: 0,
  actions: { offered: 0, accepted: 0, rejected: 0 },
  admissionAttempts: [],
  reconnects: [],
  rejections: [],
  checks: [],
};
const peers = [];
const samples = new Map();
const durableSamples = [];
const observations = [];
let stopping = false;
let stopReason;
let game;
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
  const result = await client.action(anyApi.auth.signIn, {
    provider: 'password',
    params: {
      flow: 'signUp',
      email: `load-${index}-${randomBytes(6).toString('hex')}@example.invalid`,
      password: randomBytes(24).toString('hex'),
    },
  });
  assert.ok(result.tokens?.token);
  client.setAuth(result.tokens.token);
  return { client, index };
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
function apply(peer, message) {
  if (message.type === 'view') {
    peer.view = message;
    peer.authorized = true;
  }
  if (message.type === 'admission') {
    peer.authorized = false;
  }
  if (message.type === 'rejected') {
    report.rejections.push({ peer: peer.index, requestId: message.requestId, message: message.message });
  }
  if (message.completedCommandId || message.requestId || message.type === 'carry' || message.type === 'metrics') {
    peer.responses.set(message.completedCommandId ?? message.requestId ?? message.carryId ?? 'metrics', message);
  }
  if (message.type !== 'activity' && message.type !== 'view') {
    return;
  }
  for (const [kind, entries] of [
    ['pointer', message.pointers],
    ['pose', message.carries],
  ]) {
    for (const entry of entries) {
      if (entry.sourceSeq === undefined || entry.sourceSeq < 0) {
        continue;
      }
      const key = `${kind}/${entry.connectionId}/${entry.sourceSeq}`;
      const sample = samples.get(key);
      if (!sample || !sample.expected.has(peer.index) || sample.seen.has(peer.index)) {
        continue;
      }
      sample.seen.add(peer.index);
      observations.push({
        recipient: peer.index,
        kind,
        seq: entry.sourceSeq,
        source: sample.source,
        ms: performance.now() - sample.at,
      });
    }
  }
}
async function connect(peer, simultaneous = false) {
  const started = performance.now();
  peer.view = undefined;
  peer.authorized = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (stopping) {
      throw new Error(stopReason);
    }
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
      continue;
    }
    if (!issued.ok) {
      const retryAfterMs = Math.max(1000, issued.retryAfterMs ?? 1000);
      report.admissionAttempts.push({ peer: peer.index, attempt, result: issued.reason, simultaneous, retryAfterMs });
      await delay(retryAfterMs);
      continue;
    }
    const socket = new WebSocket(`${origin.origin.replace('http:', 'ws:')}/__play/games/${game.gameId}/socket`, {
      origin: origin.origin,
    });
    peer.socket = socket;
    peer.responses = new Map();
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      accountBytes('received', raw.byteLength);
      report.deliveries++;
      peer.receivedBytes = (peer.receivedBytes ?? 0) + raw.byteLength;
      if (!stopping) {
        const message = JSON.parse(raw.toString());
        peer.messagesByType ??= {};
        const counts = (peer.messagesByType[message.type] ??= { deliveries: 0, bytes: 0, maxBytes: 0 });
        counts.deliveries++;
        counts.bytes += raw.byteLength;
        counts.maxBytes = Math.max(counts.maxBytes, raw.byteLength);
        apply(peer, message);
      }
    });
    await new Promise((resolve) => {
      socket.once('open', resolve);
      socket.once('error', resolve);
    });
    if (socket.readyState === WebSocket.OPEN) {
      send(peer, { type: 'admit', ticket: issued.ticket });
      await until(() => peer.view || socket.readyState !== WebSocket.OPEN, 'Admission did not settle.', 7000).catch(
        () => {}
      );
    }
    const success = Boolean(peer.view);
    report.admissionAttempts.push({
      peer: peer.index,
      attempt,
      result: success ? 'admitted' : 'refused',
      simultaneous,
    });
    if (success) {
      return performance.now() - started;
    }
    socket.terminate();
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
async function durable(peer, action) {
  report.actions.offered++;
  const commandId = randomUUID();
  const message = { type: 'command', commandId, action, expectedRevision: peer.view.snapshot.revision };
  const at = performance.now();
  try {
    const result = await request(peer, message, commandId);
    report.actions.accepted++;
    durableSamples.push(performance.now() - at);
    return { message, result };
  } catch (error) {
    report.actions.rejected++;
    throw error;
  }
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
    for (let pass = 0; pass < rows.length; pass++) {
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
  game = await admin.mutation(
    anyApi.playTesting.createFixture,
    values.profile === 'baseline' ? {} : { loadProfile: values.profile }
  );
  const provision = await fetch(`${origin.origin}/__play/games/${game.gameId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: game.gameId, secret: game.secret, attemptId: game.attemptId }),
  });
  assert.equal(provision.status, 200);
  const playerCount = values.profile === 'baseline' ? 2 : manifest.players;
  const observerCount = values.profile === 'baseline' ? 1 : manifest.observers;
  const secondaryCount = values.profile === 'baseline' ? 1 : manifest.secondaryTabs;
  const users = [];
  for (let index = 0; index < playerCount + observerCount; index++) {
    users.push(await user(index));
    const peer = { index: peers.length, user: users[index], role: index < playerCount ? 'player' : 'observer' };
    peers.push(peer);
    await connect(peer);
    await delay(100);
  }
  for (let index = 0; index < secondaryCount; index++) {
    const peer = { index: peers.length, user: users[index], role: 'secondary' };
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
  assert.equal(
    snapshot.table.pieces.length,
    values.profile === 'baseline' ? 6 : values.profile === 'stacked' ? 294 : 750
  );
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
  const metricsStart = await request(first, { type: 'metrics' }, 'metrics');
  report.serverBefore = metricsStart;
  if (values.case === 'reconnect') {
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
    const movers = players.slice(0, moverCount);
    for (let index = 0; index < movers.length; index++) {
      const peer = movers[index];
      peer.carryId = `load-${index}`;
      const piece = peer.view.snapshot.table.pieces[index];
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
    report.checks.push(`${movers.length} different players carry different pieces concurrently.`);
    report.resourcesBefore = processResources();
    report.bytesBeforeMotion = { ...report.bytes };
    const measuredAt = performance.now();
    const duration = manifest.probe.seconds * 1000;
    let actionFailure;
    const actionWork = (async () => {
      let offered = 0;
      while (!stopping && performance.now() - measuredAt < duration) {
        const due = measuredAt + offered * 500;
        if (performance.now() < due) {
          await delay(due - performance.now());
        }
        if (stopping || performance.now() - measuredAt >= duration) {
          break;
        }
        await durable(
          first,
          offered % 2 === 0
            ? { kind: 'rotate', pieceId: snapshot.table.pieces.at(-1).id, direction: 1 }
            : { kind: 'flip', pieceId: snapshot.table.pieces.at(-1).id }
        );
        offered++;
      }
    })().catch((error) => {
      actionFailure = error;
    });
    let seq = 0;
    while (!stopping && performance.now() - measuredAt < duration) {
      const due = measuredAt + seq * 50;
      if (performance.now() < due) {
        await delay(due - performance.now());
      }
      if (stopping) {
        break;
      }
      for (let index = 0; index < movers.length; index++) {
        const peer = movers[index];
        const position = [-5 + index * 0.5, 1.5 + Math.sin((seq + seed) / 20) * 0.1, 4];
        for (const kind of ['pointer', 'pose']) {
          samples.set(`${kind}/${peer.view.viewer.connectionId}/${seq}`, {
            at: performance.now(),
            source: peer.index,
            expected: new Set(peers.filter((p) => p !== peer).map((p) => p.index)),
            seen: new Set(),
          });
          const sent = send(
            peer,
            kind === 'pointer'
              ? { type: 'pointer', seq, position }
              : { type: 'pose', carryId: peer.carryId, seq, position, orientation: 0 }
          );
          if (sent) {
            report.transmittedMotion++;
          } else {
            samples.delete(`${kind}/${peer.view.viewer.connectionId}/${seq}`);
          }
        }
      }
      seq++;
    }
    report.measuredMs = performance.now() - measuredAt;
    report.resourcesAfter = processResources();
    await actionWork;
    if (actionFailure && !stopping) {
      throw actionFailure;
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
  report.stopReason = stopReason ?? (report.status === 'failed' ? 'failed' : 'completed');
  report.byteLimitOvershoot = Math.max(
    0,
    report.bytes.sent + report.bytes.received - report.bounds.maxApplicationBytes
  );
  report.limitBoundary =
    'The coordinator terminates sockets at the byte threshold; already in-flight frames are counted as overshoot.';
  if (report.measuredMs) {
    const before = report.bytesBeforeMotion;
    report.measuredApplicationBytes = report.bytes.sent + report.bytes.received - before.sent - before.received;
    report.applicationBytesPerSecond = report.measuredApplicationBytes / (report.measuredMs / 1000);
    report.estimatedSteadyMatrixApplicationBytes =
      report.applicationBytesPerSecond *
      (manifest.warmupSeconds + manifest.measuredSeconds) *
      manifest.repetitions *
      manifest.profiles.length;
  }
  stop('cleanup');
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
  report.motion = distribution(observations.map((o) => o.ms));
  report.durable = distribution(durableSamples);
  report.missingDeliveries = [...samples.values()].reduce((total, s) => total + s.expected.size - s.seen.size, 0);
  report.perClient = peers.map((p) => ({
    peer: p.index,
    sentBytes: p.sentBytes ?? 0,
    receivedBytes: p.receivedBytes ?? 0,
    messagesByType: p.messagesByType ?? {},
    missingDeliveries: [...samples.values()].filter(
      (sample) => sample.expected.has(p.index) && !sample.seen.has(p.index)
    ).length,
    ...distribution(observations.filter((o) => o.recipient === p.index).map((o) => o.ms)),
  }));
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(directory, 'observations.ndjson'), observations.map((o) => JSON.stringify(o)).join('\n'));
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
