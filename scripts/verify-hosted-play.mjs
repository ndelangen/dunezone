import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--env-file') || !args.includes('--origin')) {
  throw new Error('Pass an isolated backend env file and publisher origin.');
}
const localEnv = parseEnv(await readFile(option('--env-file'), 'utf8'));
const backend = new URL(localEnv.CONVEX_SELF_HOSTED_URL);
const origin = new URL(option('--origin'));
for (const url of [backend, origin]) {
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
  assert.equal(url.username, '');
}
assert.ok(localEnv.CONVEX_SELF_HOSTED_ADMIN_KEY);
const admin = new ConvexHttpClient(backend.origin, { logger: false });
admin.setAdminAuth(localEnv.CONVEX_SELF_HOSTED_ADMIN_KEY);
const anonymous = new ConvexHttpClient(backend.origin, { logger: false });
const sockets = [];
const results = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, description, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await delay(25);
  }
  throw new Error(description);
}
const passed = (name, detail) => {
  results.push({ name, ...detail });
  console.log(`PASS ${name}`);
};
async function login(label, existing) {
  const credentials = existing ?? {
    email: `${label}-${randomBytes(6).toString('hex')}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  };
  const client = new ConvexHttpClient(backend.origin, { logger: false });
  const result = await client.action(anyApi.auth.signIn, {
    provider: 'password',
    params: { flow: existing ? 'signIn' : 'signUp', ...credentials },
  });
  assert.ok(result.tokens?.token);
  client.setAuth(result.tokens.token);
  const { sub } = JSON.parse(Buffer.from(result.tokens.token.split('.')[1], 'base64url'));
  const [userId, sessionId] = sub.split('|');
  return { client, credentials, userId, sessionId, tokens: result.tokens };
}
async function open(gameId, ticket) {
  const socket = new WebSocket(`${origin.origin.replace('http:', 'ws:')}/__play/games/${gameId}/socket`, {
    origin: origin.origin,
  });
  const messages = [];
  const peer = {
    socket,
    messages,
    closeCode: undefined,
    send(value) {
      socket.send(JSON.stringify(value));
    },
    view() {
      return messages.findLast((message) => message.type === 'view');
    },
  };
  sockets.push(peer);
  socket.on('message', (bytes) => messages.push(JSON.parse(bytes.toString())));
  socket.on('close', (code) => {
    peer.closeCode = code;
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  if (ticket) {
    peer.send({ type: 'admit', ticket });
  }
  return peer;
}
async function connect(gameId, user) {
  const issued = await user.client.mutation(anyApi.playAdmission.issueTicket, { gameId });
  assert.equal(issued.ok, true);
  const peer = await open(gameId, issued.ticket);
  await until(() => peer.view() || peer.closeCode, 'No admission result.');
  assert.ok(peer.view(), `Admission refused with ${peer.closeCode}.`);
  return peer;
}
async function command(peer, action) {
  await until(
    () => peer.messages.findLast((message) => message.type === 'view' || message.type === 'admission')?.type === 'view',
    'Table did not regain authorization.'
  );
  const commandId = randomUUID();
  peer.send({ type: 'command', commandId, action, expectedRevision: peer.view().snapshot.revision });
  await until(
    () => peer.messages.find((message) => message.completedCommandId === commandId || message.requestId === commandId),
    'Command not acknowledged.'
  );
  const rejection = peer.messages.find((message) => message.requestId === commandId);
  assert.equal(rejection, undefined, rejection?.message);
}
try {
  const fixture = await admin.mutation(anyApi.playTesting.createFixture, {});
  const provisions = await Promise.all(
    [0, 1].map(() =>
      fetch(`${origin.origin}/__play/games/${fixture.gameId}/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: fixture.gameId, secret: fixture.secret, attemptId: fixture.attemptId }),
      })
    )
  );
  assert.deepEqual(
    provisions.map((response) => response.status).sort((a, b) => a - b),
    [200, 403]
  );
  const duplicate = await fetch(`${origin.origin}/__play/games/${fixture.gameId}/provision`, {
    method: 'POST',
    body: JSON.stringify({ gameId: fixture.gameId, secret: fixture.secret, attemptId: fixture.attemptId }),
  });
  const unknown = await fetch(`${origin.origin}/__play/games/${fixture.gameId}/provision`, {
    method: 'POST',
    body: JSON.stringify({ gameId: fixture.gameId, secret: '0'.repeat(64), attemptId: fixture.attemptId }),
  });
  assert.equal(duplicate.status, unknown.status);
  assert.equal(await duplicate.text(), await unknown.text());
  passed('Concurrent provisioning creates one game and conceals duplicate versus unknown credentials');
  assert.equal((await anonymous.mutation(anyApi.playAdmission.issueTicket, { gameId: fixture.gameId })).ok, false);
  const pending = await open(fixture.gameId);
  pending.send({ type: 'command', commandId: randomUUID(), action: { kind: 'reset' }, expectedRevision: 0 });
  await until(() => pending.closeCode, 'Pending socket did not time out.', 7000);
  assert.equal(pending.closeCode, 4408);
  assert.deepEqual(pending.messages, []);
  passed('Anonymous and never-admitted sockets receive no game state and cannot issue commands');
  const alice = await login('alice');
  const bob = await login('bob');
  const observer = await login('observer');
  const a = await connect(fixture.gameId, alice);
  const b = await connect(fixture.gameId, bob);
  const c = await connect(fixture.gameId, observer);
  assert.equal(a.view().viewer.viewerSeat, 'harkonnen');
  assert.equal(b.view().viewer.viewerSeat, 'atreides');
  assert.equal(c.view().viewer.viewerSeat, 'neutral');
  passed('Independent non-admin Auth sessions receive server-assigned seats and an observer view');
  const revision = b.view().snapshot.revision;
  const ca = randomUUID(),
    cb = randomUUID();
  a.send({ type: 'command', commandId: ca, action: { kind: 'storm', direction: 1 }, expectedRevision: revision });
  b.send({ type: 'command', commandId: cb, action: { kind: 'storm', direction: 1 }, expectedRevision: revision });
  await until(
    () =>
      [a, b].some((peer) =>
        peer.messages.some((message) => message.type === 'rejected' && [ca, cb].includes(message.requestId))
      ),
    'Contested revision was not rejected.'
  );
  await until(() => [a, b, c].every((peer) => peer.view().snapshot.revision === revision + 1), 'Browsers diverged.');
  assert.deepEqual(a.view().snapshot, b.view().snapshot);
  passed('Contested commands commit once and all viewers receive the same durable revision');
  const beforeObserver = c.view().snapshot.revision;
  c.send({ type: 'command', commandId: 'observer-write', action: { kind: 'reset' }, expectedRevision: beforeObserver });
  await until(
    () => c.messages.some((message) => message.requestId === 'observer-write'),
    'Observer command did not reject.'
  );
  assert.equal(c.view().snapshot.revision, beforeObserver);
  await command(a, { kind: 'phase' });
  c.send({ type: 'history', step: 1 });
  const history = await until(() => c.messages.find((message) => message.type === 'history'), 'History unavailable.');
  assert.deepEqual(history.snapshot, a.view().snapshot);
  passed('Observers cannot mutate; authenticated phase playback reproduces the boundary');
  const originalItems = a
    .view()
    .snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id))
    .sort();
  a.send({
    type: 'begin',
    carryId: 'conserved-carry',
    sourcePieceId: 'harkonnen-force-stack',
    expectedVersion: 0,
    pickup: 'top',
  });
  await until(
    () => a.messages.some((message) => message.type === 'carry' && message.carryId === 'conserved-carry'),
    'Carry not reserved.'
  );
  b.send({
    type: 'begin',
    carryId: 'contested-carry',
    sourcePieceId: 'harkonnen-force-stack',
    expectedVersion: 0,
    pickup: 'whole',
  });
  await until(
    () => b.messages.some((message) => message.requestId === 'contested-carry'),
    'Contested carry not rejected.'
  );
  for (let seq = 1; seq <= 12; seq++) {
    a.send({ type: 'pointer', seq, position: [seq / 20, 0.38, 0] });
    a.send({ type: 'pose', carryId: 'conserved-carry', seq, position: [0, 0.38, seq / 40], orientation: 0 });
  }
  await until(
    () =>
      c.messages.some(
        (message) =>
          message.type === 'activity' &&
          message.pointers.some((pointer) => pointer.connectionId === a.view().viewer.connectionId)
      ),
    'Observer did not receive public motion.'
  );
  const drop = {
    type: 'drop',
    commandId: randomUUID(),
    carryId: 'conserved-carry',
    position: [0, 0.38, 0],
    orientation: 0,
  };
  a.send(drop);
  await until(() => a.messages.some((message) => message.completedCommandId === drop.commandId), 'Drop not committed.');
  const dropRevision = a.view().snapshot.revision;
  assert.deepEqual(
    a
      .view()
      .snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id))
      .sort(),
    originalItems
  );
  const replayPeer = await connect(fixture.gameId, alice);
  replayPeer.send(drop);
  await until(
    () => replayPeer.messages.some((message) => message.completedCommandId === drop.commandId),
    'Cross-connection receipt not replayed.'
  );
  assert.equal(replayPeer.view().snapshot.revision, dropRevision);
  replayPeer.socket.close();
  passed(
    'Contested carries reserve once, transient motion reaches observers, and cross-connection receipts prevent duplicate drops'
  );
  const sharedTicket = await bob.client.mutation(anyApi.playAdmission.issueTicket, { gameId: fixture.gameId });
  assert.equal(sharedTicket.ok, true);
  const attempts = await Promise.all([
    open(fixture.gameId, sharedTicket.ticket),
    open(fixture.gameId, sharedTicket.ticket),
  ]);
  await until(() => attempts.every((peer) => peer.view() || peer.closeCode), 'Concurrent redemption did not settle.');
  assert.equal(attempts.filter((peer) => peer.view()).length, 1);
  passed('One browser ticket admits exactly one of two concurrent sockets');
  const aTab = await connect(fixture.gameId, alice);
  const seat = a.view().viewer.viewerSeat;
  const previousExpiry = await admin.mutation(anyApi.playTesting.shortenSession, {
    sessionId: alice.sessionId,
    kind: 'inactivity',
    expiresInMs: 2500,
  });
  const refreshed = await alice.client.action(anyApi.auth.signIn, { refreshToken: alice.tokens.refreshToken });
  assert.ok(refreshed.tokens?.token);
  assert.notEqual(refreshed.tokens.refreshToken, alice.tokens.refreshToken);
  const refreshedSubject = JSON.parse(Buffer.from(refreshed.tokens.token.split('.')[1], 'base64url')).sub;
  assert.equal(refreshedSubject, `${alice.userId}|${alice.sessionId}`);
  alice.client.setAuth(refreshed.tokens.token);
  await until(() => Date.now() > previousExpiry.expiresAt + 100, 'Previous refresh deadline did not elapse.');
  assert.equal(a.closeCode, undefined);
  assert.equal(aTab.closeCode, undefined);
  await command(a, { kind: 'storm', direction: 1 });
  assert.equal(a.view().viewer.viewerSeat, seat);
  passed('Actual Auth refresh rotation extends inactivity without changing the session or seat');
  await admin.mutation(anyApi.playTesting.setAdministrator, { userId: alice.userId, enabled: true });
  await admin.mutation(anyApi.playTesting.setAdministrator, { userId: alice.userId, enabled: false });
  await command(a, { kind: 'storm', direction: 1 });
  passed('Removing administrator status does not revoke signed-in play access');
  const revokedAt = Date.now();
  await alice.client.action(anyApi.auth.signOut, {});
  await until(() => a.closeCode && aTab.closeCode, 'Logout did not revoke every tab of the Auth session.');
  const revocationMs = Date.now() - revokedAt;
  assert.ok(revocationMs <= 10_000);
  assert.equal(a.closeCode, 4401);
  assert.equal(aTab.closeCode, 4401);
  const endedCounts = [a.messages.length, aTab.messages.length];
  await command(b, { kind: 'storm', direction: 1 });
  await delay(100);
  assert.deepEqual([a.messages.length, aTab.messages.length], endedCounts);
  assert.equal((await alice.client.mutation(anyApi.playAdmission.issueTicket, { gameId: fixture.gameId })).ok, false);
  const returned = await login('alice', alice.credentials);
  const aNew = await connect(fixture.gameId, returned);
  assert.equal(aNew.view().viewer.viewerSeat, seat);
  assert.notEqual(aNew.view().viewer.connectionId, a.view().viewer.connectionId);
  passed('Actual Auth logout stops all tab outputs; fresh login retains the faction seat', { revocationMs });
  const short = await login('short');
  const shortPeer = await connect(fixture.gameId, short);
  const expiry = await admin.mutation(anyApi.playTesting.shortenSession, {
    sessionId: short.sessionId,
    kind: 'inactivity',
    expiresInMs: 1500,
  });
  await until(() => Date.now() >= expiry.expiresAt, 'Short expiry did not elapse.');
  const afterExpiry = shortPeer.messages.length;
  if (shortPeer.socket.readyState === WebSocket.OPEN) {
    shortPeer.send({ type: 'metrics' });
  }
  await command(b, { kind: 'storm', direction: 1 });
  await delay(100);
  assert.ok(shortPeer.messages.slice(afterExpiry).every((message) => message.type === 'admission'));
  await until(() => shortPeer.closeCode, 'Inactivity expiry did not revoke the connection.');
  assert.equal((await short.client.mutation(anyApi.playAdmission.issueTicket, { gameId: fixture.gameId })).ok, false);
  passed('Inactivity expiry gates commands and fanout before the next reactive change');
  const long = await login('total-expiry');
  const totalPeer = await connect(fixture.gameId, long);
  await admin.mutation(anyApi.playTesting.shortenSession, { sessionId: long.sessionId, kind: 'total', expiresInMs: 0 });
  await until(() => totalPeer.closeCode, 'Total session expiry did not revoke access.');
  assert.equal((await long.client.mutation(anyApi.playAdmission.issueTicket, { gameId: fixture.gameId })).ok, false);
  passed('Total Auth session expiry rejects both established and new connections');
  await returned.client.mutation(anyApi.accountDeletion.confirm, { replacementUserId: null });
  await until(() => aNew.closeCode, 'Account deletion did not revoke the seated player.');
  const replacement = await login('replacement');
  const replacementPeer = await connect(fixture.gameId, replacement);
  assert.equal(replacementPeer.view().viewer.viewerSeat, 'harkonnen');
  passed('Actual account deletion revokes access and vacates the faction for a new user');
  b.send({ type: 'metrics' });
  const metrics = await until(
    () => b.messages.findLast((message) => message.type === 'metrics'),
    'Metrics unavailable.'
  );
  passed('Fixture payload and fanout counters are readable only after admission', { metrics });
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        results,
        limitations: [
          'Synthetic accounts in an isolated backend',
          'Browser interaction and network-failure checks run separately',
        ],
      },
      null,
      2
    )
  );
} finally {
  for (const peer of sockets) {
    peer.socket.terminate();
  }
}
