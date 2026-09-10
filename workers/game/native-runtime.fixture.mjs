import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { WebSocketServer } from 'ws';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = join(directory, '../..');
const gameId = 'fixture-game';
const secret = 'a'.repeat(64);
const attemptId = 'b'.repeat(64);
const stamp = (number) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(number));
  return bytes.toString('base64');
};

export async function eventually(read, label, timeout = 5000, report) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  } while (Date.now() < deadline);
  /* The report runs only on the way out, so a green run never pays to build state it will not print. */
  throw new Error([`Timed out waiting for ${label}`, report?.()].filter(Boolean).join('\n'));
}

async function readPeerRequest(request, response) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const record = {
    path: request.url,
    function: body.path,
    args: body.args[0],
    headers: request.headers,
    startedAt: Date.now(),
    /* How and when the request left, so a timeout can say which leg settled and which one the caller abandoned. */
    endedAt: null,
    status: null,
    response,
    release(value) {
      if (!response.destroyed) {
        record.settle(200);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'success', value, logLines: [] }));
      }
    },
    refuse(status, message = '') {
      if (!response.destroyed) {
        record.settle(status);
        response.writeHead(status);
        response.end(message);
      }
    },
    settle(status) {
      record.endedAt = Date.now();
      record.status = status;
    },
  };
  /* A caller that gives up on a held request closes the socket, which is the instant the room chose its retry
     cadence on. Nothing else records it, and it is the one fact a lost-reply failure turns on. */
  response.on('close', () => {
    if (record.endedAt === null) {
      record.settle('caller gave up');
    }
  });
  return record;
}

function confirmationUnavailable(peer) {
  if (!peer.failConfirmationBeforeDeadline || peer.confirmationRequests <= 1) {
    return false;
  }
  return Date.now() < peer.provisionExpiresAt;
}

function answerConfirmation(peer, record) {
  peer.confirmationRequests++;
  peer.confirmed ||= Date.now() < peer.provisionExpiresAt;
  if (confirmationUnavailable(peer)) {
    record.refuse(503, 'Confirmation unavailable');
  } else if (!(peer.holdFirstConfirmation && peer.confirmationRequests === 1)) {
    record.release({ ok: peer.confirmed });
  }
}

function redeemedIdentity(peer) {
  const suffix = peer.registrationId.endsWith('-b') ? 'b' : 'a';
  return {
    ok: true,
    registrationId: peer.registrationId,
    userId: `user-${suffix}`,
    sessionId: `session-${suffix}`,
    authExpiresAt: peer.expiresAt(),
    displayName: `Synthetic ${suffix.toUpperCase()}`,
  };
}

function answerPeerRequest(peer, record) {
  switch (record.function) {
    case 'playAdmission:watchAuthorizations':
      if (peer.httpMode !== 'hold') {
        record.release(peer.result(record.args, peer.httpMode === 'allow'));
      }
      break;
    case 'playProvisioning:validateProvisioning':
      /* The window opens when the peer answers, the way a real one opens when Convex answers. Fixing it earlier
         would spend an unbudgeted esbuild build and Miniflare start inside it, which is what #1120 was. */
      peer.provisionExpiresAt = Date.now() + peer.provisionWindowMs;
      record.release({ ok: true, gameId, attemptId, fixtureKey: 'hosted-demo', expiresAt: peer.provisionExpiresAt });
      break;
    case 'playProvisioning:confirmProvisioning':
      answerConfirmation(peer, record);
      break;
    case 'playAdmission:redeemTicket':
      record.release(redeemedIdentity(peer));
      break;
    case 'playAdmission:reconcileAccounts':
      record.release({
        ok: true,
        accounts: record.args.userIds.map((userId) => ({ userId, state: 'active', deletionOperationId: null })),
      });
      break;
    case 'playAdmission:ackAccountDeletion':
      record.release(null);
      break;
    default:
      record.refuse(404);
  }
}

function modifyQueries(connection, message) {
  connection.querySet = message.newVersion;
  for (const change of message.modifications) {
    if (change.type === 'Add') {
      connection.queries.set(change.queryId, change);
    } else {
      connection.queries.delete(change.queryId);
    }
  }
}

/** A local protocol peer, not an Auth implementation. Tests control the observation order. */
export async function createPeer() {
  const peer = {
    connections: [],
    requests: [],
    frames: [],
    httpMode: 'allow',
    watchMode: 'manual',
    expiresAt: () => Date.now() + 60_000,
    registrationId: 'registration-a',
    /* Set the window; read the deadline. The room cannot confirm before it validates, so nothing reads the
       deadline before the peer has issued one. */
    provisionWindowMs: 60_000,
    provisionExpiresAt: 0,
    confirmed: false,
    holdFirstConfirmation: false,
    failConfirmationBeforeDeadline: false,
    confirmationRequests: 0,
  };
  let timestamp = 0;
  function transition(connection, modifications = []) {
    const next = { querySet: connection.querySet, identity: 0, ts: stamp(++timestamp) };
    connection.socket.send(
      JSON.stringify({ type: 'Transition', startVersion: connection.version, endVersion: next, modifications })
    );
    connection.version = next;
  }
  peer.result = (args, allowed = true, expiresAt = peer.expiresAt()) => ({
    ok: true,
    generation: args.generation,
    entries: args.registrationIds.map((registrationId) => {
      const suffix = registrationId.endsWith('-b') ? 'b' : 'a';
      return {
        registrationId,
        userId: `user-${suffix}`,
        sessionId: `session-${suffix}`,
        allowed,
        authExpiresAt: expiresAt,
      };
    }),
  });
  peer.answer = ({ connection, query }, allowed = true, expiresAt = peer.expiresAt()) => {
    transition(connection, [
      {
        type: 'QueryUpdated',
        queryId: query.queryId,
        value: peer.result(query.args[0], allowed, expiresAt),
        logLines: [],
        journal: null,
      },
    ]);
  };
  /* Offsets from the provisioning deadline, because every decision in this feature turns on that instant. */
  peer.report = () =>
    [
      'Peer requests, in ms from the provisioning deadline:',
      ...peer.requests.map((request) => {
        const at = (instant) => (instant === null ? '' : Math.round(instant - peer.provisionExpiresAt));
        const left = request.endedAt === null ? 'still open' : `${at(request.endedAt)} (${request.status})`;
        return `  ${request.function} started ${at(request.startedAt)}, left ${left}`;
      }),
    ].join('\n');
  peer.latestQuery = () => {
    const connection = peer.connections.at(-1);
    const query = connection && [...connection.queries.values()].at(-1);
    return query && { connection, query };
  };
  peer.query = (predicate = () => true) =>
    eventually(() => {
      const current = peer.latestQuery();
      return current && predicate(current) && current;
    }, 'native subscription');
  const server = createServer(async (request, response) => {
    const record = await readPeerRequest(request, response);
    peer.requests.push(record);
    answerPeerRequest(peer, record);
  });
  function publishQueries(connection) {
    if (peer.watchMode === 'manual') {
      return;
    }
    for (const query of connection.queries.values()) {
      peer.answer({ connection, query }, peer.watchMode === 'allow');
    }
  }
  function receiveQuerySet(connection, data) {
    const message = JSON.parse(data.toString());
    peer.frames.push(message);
    if (message.type !== 'ModifyQuerySet') {
      return;
    }
    modifyQueries(connection, message);
    // An acknowledged subscription is deliberately not a fresh authorization snapshot.
    transition(connection);
    publishQueries(connection);
  }
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket, request) => {
    const connection = {
      socket,
      path: request.url,
      queries: new Map(),
      querySet: 0,
      version: { querySet: 0, identity: 0, ts: stamp(0) },
    };
    peer.connections.push(connection);
    socket.on('message', (data) => receiveQuerySet(connection, data));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  peer.url = `http://127.0.0.1:${server.address().port}`;
  peer.close = async () => {
    for (const connection of peer.connections) {
      connection.socket.terminate();
    }
    server.closeAllConnections();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  };
  return peer;
}

export async function createRuntime(peer, kind = 'probe') {
  const persistence = await mkdtemp(join(tmpdir(), 'dunezone-native-game-'));
  const built = await build({
    entryPoints: [join(directory, kind === 'probe' ? 'authorization.native.fixture.ts' : 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    external: ['cloudflare:workers'],
  });
  const options = convertV4MiniflareOptions({
    rootPath: repository,
    resourcePersistencePath: persistence,
    modules: true,
    script: built.outputFiles[0].text,
    compatibilityDate: '2026-08-11',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects:
      kind === 'probe'
        ? { PROBE: { className: 'AuthorizationProbe', useSQLite: true } }
        : { GAME_ROOMS: { className: 'GameRoom', useSQLite: true } },
    bindings: {
      PEER_URL: peer.url,
      CONVEX_URL: peer.url,
      APPLICATION_ORIGIN: 'http://table.test',
      GIT_SHA: 'native-test',
      CF_VERSION_METADATA: { id: 'native-test', tag: 'native-test' },
    },
  });
  let instance = new Miniflare(options);
  return {
    fetch(path, init) {
      return instance.dispatchFetch(`http://table.test${path}`, init);
    },
    async request(path) {
      return (await this.fetch(path)).json();
    },
    async restart() {
      await instance.dispose();
      instance = new Miniflare(options);
    },
    async close() {
      await instance.dispose();
      await rm(persistence, { recursive: true, force: true });
    },
  };
}

export async function openGame(runtime) {
  const response = await runtime.fetch(`/__play/games/${gameId}/socket`, {
    headers: { Origin: 'http://table.test', Upgrade: 'websocket' },
  });
  if (response.status !== 101) {
    throw new Error(`Socket refused: ${response.status}`);
  }
  const socket = response.webSocket;
  const connection = { socket, messages: [], closed: false };
  socket.addEventListener('message', (event) => connection.messages.push(JSON.parse(event.data)));
  socket.addEventListener('close', () => {
    connection.closed = true;
  });
  socket.accept();
  connection.send = (message) => socket.send(JSON.stringify(message));
  connection.message = (type, predicate = () => true) =>
    eventually(() => connection.messages.find((message) => message.type === type && predicate(message)), type);
  return connection;
}

export function provision(runtime) {
  return runtime.fetch(`/__play/games/${gameId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, secret, attemptId }),
  });
}
