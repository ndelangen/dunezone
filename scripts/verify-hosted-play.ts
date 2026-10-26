import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes, randomUUID, scrypt } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import WebSocket from 'ws';
import type { RawData } from 'ws';

import { api, internal } from '../convex/_generated/api.ts';
import type { Id } from '../convex/_generated/dataModel.ts';
import type { ClientMessage, PieceAction, ServerMessage } from '../src/shared/play/protocol.ts';
import type { RoomView } from '../src/shared/play/updates.ts';
import { setAdminAuth, adminMutationReference } from './lib/convex-admin.ts';
import { required } from './verify-hosted-types.ts';

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
if (!args.includes('--env-file') || !args.includes('--origin')) {
  throw new Error('Pass an isolated backend env file and publisher origin.');
}
const localEnv = parseEnv(await readFile(option('--env-file'), 'utf8'));
const backend = new URL(required(localEnv.CONVEX_SELF_HOSTED_URL, 'CONVEX_SELF_HOSTED_URL'));
const origin = new URL(option('--origin'));
/* The launcher runs this file directly in Node 24. Keep the origin guard before every backend request. */
for (const [label, url] of [
  ['CONVEX_SELF_HOSTED_URL', backend],
  ['--origin', origin],
] as const) {
  if (!url.port || url.href !== `http://127.0.0.1:${url.port}/`) {
    throw new Error(`${label} must be an explicit http://127.0.0.1:PORT origin.`);
  }
}
assert.ok(localEnv.CONVEX_SELF_HOSTED_ADMIN_KEY);
const admin = new ConvexHttpClient(backend.origin, { logger: false });
setAdminAuth(admin, localEnv.CONVEX_SELF_HOSTED_ADMIN_KEY);
const anonymous = new ConvexHttpClient(backend.origin, { logger: false });
const sockets: ProtocolPeer[] = [];
const results: ({ name: string } & Record<string, unknown>)[] = [];
const delay = (ms: number | undefined) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<Value>(
  predicate: () => Value | Promise<Value>,
  description: string,
  timeout = 15_000
): Promise<Exclude<Value, undefined | null | false>> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await predicate();
    if (value) {
      return value as Exclude<Value, undefined | null | false>;
    }
    await delay(25);
  }
  throw new Error(description);
}
const passed = (name: string, detail: Record<string, unknown> = {}) => {
  results.push({ name, ...detail });
  console.log(`PASS ${name}`);
};
/*
 * Scrypt and PBKDF2 match scripts/lib/synthetic-accounts.ts. That module also imports extensionless shared modules, so this direct Node entry keeps the hashing here.
 * The provisioning control keeps the one the backend's Password checks, and a secret that Password does not accept fails the first sign-in.
 */
function passwordSecret(password: string) {
  const salt = randomBytes(16).toString('hex');
  return new Promise<string>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16_384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)
    );
  });
}
function pbkdf2Secret(password: BinaryLike) {
  const salt = randomBytes(16).toString('hex');
  const key = pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return `pbkdf2-sha256:${salt}:${key}`;
}
/* Every account the checks sign in; they are created before the first sign-in, so no check signs up under the backend's function limit (#1493). */
const accounts = Object.fromEntries(
  ['alice', 'bob', 'observer', 'short', 'total-expiry', 'replacement'].map((label) => [
    label,
    { email: `${label}-${randomBytes(6).toString('hex')}@example.invalid`, password: randomBytes(24).toString('hex') },
  ])
);
/* Six accounts, the most scripts/lib/synthetic-accounts.ts sends in one provisioning mutation. */
async function provisionAccounts() {
  const hashed = await Promise.all(
    Object.values(accounts).map(async ({ email, password }) => ({
      email,
      scrypt: await passwordSecret(password),
      pbkdf2: pbkdf2Secret(password),
    }))
  );
  await admin.mutation(adminMutationReference(internal.playTesting.provisionAccounts), { accounts: hashed });
}
async function login(label: string) {
  assert.ok(accounts[label], `${label} has no provisioned account.`);
  const client = new ConvexHttpClient(backend.origin, { logger: false });
  const result = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', ...accounts[label] },
  });
  assert.ok(result.tokens?.token);
  client.setAuth(result.tokens.token);
  const { userId, sessionId } = tokenIdentity(result.tokens.token);
  return { client, userId, sessionId, tokens: result.tokens };
}
async function open(gameId: Id<'play_games'>, pass?: string): Promise<ProtocolPeer> {
  const socket = new WebSocket(`${origin.origin.replace('http:', 'ws:')}/__play/games/${gameId}/socket`, {
    origin: origin.origin,
  });
  const messages: ServerMessage[] = [];
  const peer: ProtocolPeer = {
    socket,
    messages,
    closeCode: undefined,
    send(value: ClientMessage) {
      socket.send(JSON.stringify(value));
    },
    /* The latest full view: updates after it are not applied here, so a read of current state asks with `fresh`. */
    view() {
      return messages.findLast((message) => message.type === 'view');
    },
  };
  sockets.push(peer);
  socket.on('message', (bytes) => messages.push(readServerMessage(rawText(bytes))));
  socket.on('close', (code) => {
    peer.closeCode = code;
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  if (pass) {
    peer.send({ type: 'admit', supportsBoard: true, pass });
  }
  return peer;
}
async function seatPass(gameId: Id<'play_games'>, user: Awaited<ReturnType<typeof login>>) {
  const issued = await user.client.mutation(api.playAdmission.enrolPlayer, { gameId });
  assert.ok(issued.ok);
  return issued.pass;
}
async function connect(gameId: Id<'play_games'>, user: Awaited<ReturnType<typeof login>>) {
  const peer = await open(gameId, await seatPass(gameId, user));
  await until(() => peer.view() || peer.closeCode, 'No admission result.');
  assert.ok(peer.view(), `Admission refused with ${peer.closeCode}.`);
  return peer;
}
/** Asks the Worker for a full view and returns it. */
async function fresh(peer: ProtocolPeer) {
  const before = peer.messages.length;
  peer.send({ type: 'sync' });
  return until(() => peer.messages.slice(before).find((message) => message.type === 'view'), 'No fresh view.');
}
async function command(peer: ProtocolPeer, action: PieceAction) {
  await until(
    () => peer.messages.findLast((message) => message.type === 'view' || message.type === 'admission')?.type === 'view',
    'Table did not regain authorization.'
  );
  const commandId = randomUUID();
  peer.send({ type: 'command', commandId, action, expectedRevision: (await fresh(peer)).snapshot.revision });
  await until(
    () =>
      peer.messages.find(
        (message) =>
          ('completedCommandId' in message && message.completedCommandId === commandId) ||
          ('requestId' in message && message.requestId === commandId)
      ),
    'Command not acknowledged.'
  );
  const rejection = peer.messages.find((message) => message.type === 'rejected' && message.requestId === commandId);
  assert.equal(rejection, undefined, rejection?.type === 'rejected' ? rejection.message : 'Command was rejected.');
}
try {
  await provisionAccounts();
  const fixture = await admin.mutation(adminMutationReference(internal.playTesting.createFixture), {});
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
  assert.equal((await anonymous.mutation(api.playAdmission.enrolPlayer, { gameId: fixture.gameId })).ok, false);
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
  assert.equal(required(a.view(), 'Alice view').viewer.viewerSeat, 'harkonnen');
  assert.equal(required(b.view(), 'Bob view').viewer.viewerSeat, 'atreides');
  assert.equal(required(c.view(), 'Observer view').viewer.viewerSeat, 'neutral');
  passed('Independent non-admin Auth sessions receive server-assigned seats and an observer view');
  const revision = (await fresh(b)).snapshot.revision;
  const ca = randomUUID(),
    cb = randomUUID();
  a.send({ type: 'command', commandId: ca, action: { kind: 'storm', direction: 1 }, expectedRevision: revision });
  b.send({ type: 'command', commandId: cb, action: { kind: 'storm', direction: 1 }, expectedRevision: revision });
  await until(
    () =>
      [a, b].some((peer) =>
        peer.messages.some(
          (message) => message.type === 'rejected' && [String(ca), String(cb)].includes(message.requestId)
        )
      ),
    'Contested revision was not rejected.'
  );
  await until(
    () =>
      [a, b, c].every((peer) =>
        peer.messages.some((message) => message.type === 'update' && message.snapshot?.revision === revision + 1)
      ),
    'Browsers diverged.'
  );
  const [aView, bView, cView] = await Promise.all([a, b, c].map(fresh));
  assert.equal(aView.snapshot.revision, revision + 1);
  assert.deepEqual({ ...aView.snapshot, bank: undefined }, { ...bView.snapshot, bank: undefined });
  assert.deepEqual(aView.snapshot.bank, { factionId: 'harkonnen', balance: 0 });
  assert.deepEqual(bView.snapshot.bank, { factionId: 'atreides', balance: 0 });
  assert.equal(Object.hasOwn(cView.snapshot, 'bank'), false);
  const cUpdate = c.messages.find(
    (message) => message.type === 'update' && message.snapshot?.revision === revision + 1
  );
  assert.ok(cUpdate?.type === 'update');
  assert.equal(Object.hasOwn(required(cUpdate.snapshot, 'observer update'), 'bank'), false);
  passed('Contested commands commit once and all viewers receive the same durable revision');
  const beforeObserver = cView.snapshot.revision;
  c.send({ type: 'command', commandId: 'observer-write', action: { kind: 'reset' }, expectedRevision: beforeObserver });
  await until(
    () => c.messages.some((message) => 'requestId' in message && message.requestId === 'observer-write'),
    'Observer command did not reject.'
  );
  assert.equal((await fresh(c)).snapshot.revision, beforeObserver);
  await command(a, { kind: 'phase' });
  c.send({ type: 'history', step: 1 });
  const history = await until(() => c.messages.find((message) => message.type === 'history'), 'History unavailable.');
  assert.deepEqual(history.snapshot, (await fresh(c)).snapshot);
  assert.equal(Object.hasOwn(history.snapshot, 'bank'), false);
  passed('Observers cannot mutate; authenticated phase playback reproduces the boundary');
  /* The storm moves only during Storm (#1138), and the storm is this script's probe command below, so return to Storm once the phase cooldown allows. */
  await delay(8100);
  await command(a, { kind: 'phase', direction: -1 });
  const originalItems = (await fresh(a)).snapshot.table.pieces
    .flatMap((piece) => piece.items.map((item) => item.id))
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
    () => b.messages.some((message) => 'requestId' in message && message.requestId === 'contested-carry'),
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
          message.type === 'update' &&
          [...message.activity.pointers, ...message.activity.pointerMoves].some(
            (pointer) => pointer.connectionId === required(a.view(), 'Alice view').viewer.connectionId
          )
      ),
    'Observer did not receive public motion.'
  );
  const drop: Extract<ClientMessage, { type: 'drop' }> = {
    type: 'drop',
    commandId: randomUUID(),
    carryId: 'conserved-carry',
    position: [0, 0.38, 0],
    orientation: 0,
  };
  a.send(drop);
  await until(
    () =>
      a.messages.some((message) => 'completedCommandId' in message && message.completedCommandId === drop.commandId),
    'Drop not committed.'
  );
  const dropped = await fresh(a);
  const dropRevision = dropped.snapshot.revision;
  assert.deepEqual(
    dropped.snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort(),
    originalItems
  );
  const replayPeer = await connect(fixture.gameId, alice);
  replayPeer.send(drop);
  await until(
    () =>
      replayPeer.messages.some(
        (message) => 'completedCommandId' in message && message.completedCommandId === drop.commandId
      ),
    'Cross-connection receipt not replayed.'
  );
  assert.equal(required(replayPeer.view(), 'Replay view').snapshot.revision, dropRevision);
  replayPeer.socket.close();
  passed(
    'Contested carries reserve once, transient motion reaches observers, and cross-connection receipts prevent duplicate drops'
  );
  const genuine = await seatPass(fixture.gameId, bob);
  /*
   * The signature is the part after the dot. Its first character carries six signature bits, so changing it keeps the shape
   * and breaks the HMAC; the last character would not, since its low bits are base64url padding the decoder ignores.
   */
  const dot = genuine.indexOf('.') + 1;
  const forged = `${genuine.slice(0, dot)}${genuine[dot] === 'A' ? 'B' : 'A'}${genuine.slice(dot + 1)}`;
  const forgedPeer = await open(fixture.gameId, forged);
  await until(() => forgedPeer.view() || forgedPeer.closeCode, 'Forged pass did not settle.');
  assert.equal(forgedPeer.closeCode, 4401);
  assert.equal(forgedPeer.view(), undefined);
  passed('A seat pass whose signature does not match the game is refused');
  const aTab = await connect(fixture.gameId, alice);
  const seat = required(a.view(), 'Alice view').viewer.viewerSeat;
  const previousExpiry = await admin.mutation(adminMutationReference(internal.playTesting.shortenSession), {
    sessionId: alice.sessionId,
    kind: 'inactivity',
    expiresInMs: 2500,
  });
  const refreshed = await alice.client.action(api.auth.signIn, { refreshToken: alice.tokens.refreshToken });
  assert.ok(refreshed.tokens?.token);
  assert.notEqual(refreshed.tokens.refreshToken, alice.tokens.refreshToken);
  const refreshedIdentity = tokenIdentity(refreshed.tokens.token);
  const refreshedSubject = `${refreshedIdentity.userId}|${refreshedIdentity.sessionId}`;
  assert.equal(refreshedSubject, `${alice.userId}|${alice.sessionId}`);
  alice.client.setAuth(refreshed.tokens.token);
  await until(() => Date.now() > previousExpiry.expiresAt + 100, 'Previous refresh deadline did not elapse.');
  assert.equal(a.closeCode, undefined);
  assert.equal(aTab.closeCode, undefined);
  await command(a, { kind: 'storm', direction: 1 });
  assert.equal(required(a.view(), 'Alice view').viewer.viewerSeat, seat);
  passed('Actual Auth refresh rotation extends inactivity without changing the session or seat');
  await admin.mutation(adminMutationReference(internal.playTesting.setAdministrator), {
    userId: alice.userId,
    enabled: true,
  });
  await admin.mutation(adminMutationReference(internal.playTesting.setAdministrator), {
    userId: alice.userId,
    enabled: false,
  });
  await command(a, { kind: 'storm', direction: 1 });
  passed('Removing administrator status does not revoke signed-in play access');
  const heldFrom = b.messages.length;
  const revokedAt = Date.now();
  await alice.client.action(api.auth.signOut, {});
  await until(() => a.closeCode && aTab.closeCode, 'Logout did not revoke every tab of the Auth session.');
  const revocationMs = Date.now() - revokedAt;
  assert.ok(revocationMs <= 10_000);
  assert.equal(a.closeCode, 4401);
  assert.equal(aTab.closeCode, 4401);
  const endedCounts = [a.messages.length, aTab.messages.length];
  await command(b, { kind: 'storm', direction: 1 });
  await delay(100);
  assert.deepEqual([a.messages.length, aTab.messages.length], endedCounts);
  assert.equal((await alice.client.mutation(api.playAdmission.enrolPlayer, { gameId: fixture.gameId })).ok, false);
  const returned = await login('alice');
  const aNew = await connect(fixture.gameId, returned);
  assert.equal(required(aNew.view(), 'New view').viewer.viewerSeat, seat);
  assert.notEqual(
    required(aNew.view(), 'New view').viewer.connectionId,
    required(a.view(), 'Alice view').viewer.connectionId
  );
  passed('Actual Auth logout stops all tab outputs; fresh login retains the faction seat', { revocationMs });
  /* A seat pass never outlives the session that asked for it, so a session nearing its end gets a pass that ends with it. */
  const expiring = async (label: string, kind: 'inactivity' | 'total') => {
    const user = await login(label);
    const expiry = await admin.mutation(adminMutationReference(internal.playTesting.shortenSession), {
      sessionId: user.sessionId,
      kind,
      expiresInMs: 10_000,
    });
    const peer = await connect(fixture.gameId, user);
    await until(
      () => peer.messages.some((message) => message.type === 'admission' && message.status === 'pass-expired'),
      `${kind} expiry did not end the pass.`,
      expiry.expiresAt - Date.now() + 5000
    );
    const afterExpiry = peer.messages.length;
    if (peer.socket.readyState === WebSocket.OPEN) {
      peer.send({ type: 'metrics' });
    }
    await command(b, { kind: 'storm', direction: 1 });
    await delay(100);
    assert.ok(peer.messages.slice(afterExpiry).every((message) => message.type === 'admission'));
    assert.equal((await user.client.mutation(api.playAdmission.enrolPlayer, { gameId: fixture.gameId })).ok, false);
  };
  await expiring('short', 'inactivity');
  passed('Inactivity expiry ends the seat pass, gating commands and fanout, and no new pass is issued');
  await expiring('total-expiry', 'total');
  passed('Total Auth session expiry ends the seat pass and no new pass is issued');
  await returned.client.mutation(api.accountDeletion.confirm, { replacementUserId: null });
  await until(() => aNew.closeCode, 'Account deletion did not revoke the seated player.');
  const replacement = await login('replacement');
  const replacementPeer = await connect(fixture.gameId, replacement);
  assert.equal(required(replacementPeer.view(), 'Replacement view').viewer.viewerSeat, 'harkonnen');
  passed('Actual account deletion revokes access and vacates the faction for a new user');
  /* A sign-out, expiry or deletion ends only the connections it concerns; every other player keeps playing (#1418). */
  assert.deepEqual(
    b.messages.slice(heldFrom).filter((message) => message.type === 'admission'),
    []
  );
  passed("Other players' sign-out, expiry and deletion never pause a connected player");
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

type ProtocolPeer = {
  socket: WebSocket;
  messages: ServerMessage[];
  closeCode?: number;
  send(value: ClientMessage): void;
  view(): RoomView | undefined;
};

/** The token is issued by the isolated Convex backend; decode its subject for the session-expiry probes. */
function tokenIdentity(token: string): { userId: Id<'users'>; sessionId: Id<'authSessions'> } {
  const decoded: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.ok(decoded !== null && typeof decoded === 'object' && 'sub' in decoded && typeof decoded.sub === 'string');
  const [userId, sessionId] = decoded.sub.split('|');
  assert.ok(userId && sessionId, 'The auth token needs a user and session subject.');
  return { userId: userId as Id<'users'>, sessionId: sessionId as Id<'authSessions'> };
}

/* A frame arrives as one Buffer, an ArrayBuffer or Buffer fragments depending on the socket's binaryType, and only a Buffer prints as its text. */
function rawText(data: RawData): string {
  return (Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)).toString();
}

/** The native Node entry keeps the wire object intact so unexpected private fields remain visible to the probes. */
function readServerMessage(text: string): ServerMessage {
  const payload: unknown = JSON.parse(text);
  assert.ok(payload !== null && typeof payload === 'object' && 'type' in payload && typeof payload.type === 'string');
  const knownTypes: ServerMessage['type'][] = [
    'conversations',
    'conversation-message',
    'conversation-history',
    'log-history',
    'spice-history',
    'faction',
    'catalogue',
    'admission',
    'carry',
    'ping',
    'view',
    'update',
    'rejected',
    'history',
    'metrics',
  ];
  assert.ok(
    knownTypes.some((type) => type === payload.type),
    'The Worker sent an unknown frame type.'
  );
  return payload as ServerMessage;
}
