import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

export async function eventually(read, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}`);
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
    response,
    release(value) {
      if (!response.destroyed) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'success', value, logLines: [] }));
      }
    },
  };
  response.on('close', () => {
    record.completedAt = Date.now();
  });
  return record;
}

function confirmationUnavailable(peer) {
  return peer.failConfirmationRetries && peer.confirmationRequests > 1;
}

function answerConfirmation(peer, record) {
  peer.confirmationRequests++;
  if (peer.holdConfirmations) {
    return;
  }
  peer.confirmed ||= Date.now() < peer.provisionExpiresAt;
  if (confirmationUnavailable(peer)) {
    record.response.writeHead(503);
    record.response.end('Confirmation unavailable');
  } else if (!(peer.holdFirstConfirmation && peer.confirmationRequests === 1)) {
    record.release({ ok: peer.confirmed });
  }
}

function redeemedIdentity(peer) {
  const suffix = peer.registrationId.split('-').at(-1);
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
    case 'assets:listByTypes':
      record.release([...peer.catalogue.values()].map((page) => page.asset));
      break;
    case 'assets:getPage':
      if (peer.catalogueMode !== 'hold') {
        record.release(peer.catalogue.get(`${record.args.type}/${record.args.slug}`) ?? null);
      }
      break;
    case 'playAdmission:watchAuthorizations':
      if (peer.httpMode === 'error') {
        record.response.writeHead(500);
        record.response.end('Validation unavailable');
      } else if (peer.httpMode !== 'hold') {
        record.release(peer.result(record.args, peer.httpMode === 'allow'));
      }
      break;
    case 'playProvisioning:validateProvisioning':
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
      record.response.writeHead(404);
      record.response.end();
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
    catalogue: new Map(),
    catalogueMode: 'allow',
    connections: [],
    requests: [],
    frames: [],
    httpMode: 'allow',
    watchMode: 'manual',
    expiresAt: () => Date.now() + 60_000,
    registrationId: 'registration-a',
    provisionExpiresAt: Date.now() + 60_000,
    confirmed: false,
    holdFirstConfirmation: false,
    holdConfirmations: false,
    failConfirmationRetries: false,
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
  /* `allowed` may be a predicate on the registration id, so one result can deny one registration only. */
  peer.result = (args, allowed = true, expiresAt = peer.expiresAt()) => ({
    ok: true,
    generation: args.generation,
    entries: args.registrationIds.map((registrationId) => {
      const suffix = registrationId.split('-').at(-1);
      return {
        registrationId,
        userId: `user-${suffix}`,
        sessionId: `session-${suffix}`,
        allowed: typeof allowed === 'function' ? allowed(registrationId) : allowed,
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
  peer.fail = ({ connection, query }, errorMessage = 'query failed') => {
    transition(connection, [{ type: 'QueryFailed', queryId: query.queryId, errorMessage, logLines: [] }]);
  };
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

export async function createRuntime(peer, kind = 'probe', bindings = {}) {
  const logs = [];
  const persistence = await mkdtemp(join(tmpdir(), 'dunezone-native-game-'));
  const built = await build({
    entryPoints: [
      join(
        directory,
        {
          probe: 'authorization.native.fixture.ts',
          game: 'game-room.native.fixture.ts',
          load: 'load-limits.native.fixture.ts',
        }[kind]
      ),
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    external: ['cloudflare:workers', 'node:*'],
  });
  const options = convertV4MiniflareOptions({
    handleStructuredLogs: (log) => logs.push(log),
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
      ...bindings,
    },
  });
  let instance = new Miniflare(options);
  await instance.ready;
  return {
    logs,
    url() {
      return instance.ready;
    },
    async clock(offset) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      return (await room.fetch(`https://native-test/native-test/clock?offset=${offset}`)).json();
    },
    async audit() {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      return (await room.fetch('https://native-test/native-test/audit')).json();
    },
    async exec(statement, params = []) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch('https://native-test/native-test/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement, params }),
      });
      return response.json();
    },
    async failStorage() {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      await room.fetch('https://native-test/native-test/fail-storage', { method: 'POST' });
    },
    async loadControl(stop = false) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch(`https://native-test/native-test/load-${stop ? 'stop' : 'status'}`);
      return response.json();
    },
    fetch(path, init) {
      return instance.dispatchFetch(`http://table.test${path}`, init);
    },
    async request(path) {
      return (await this.fetch(path)).json();
    },
    async alarm(advance = false) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch('https://native-test/native-test/alarm', { method: advance ? 'POST' : 'GET' });
      return response.json();
    },
    async restart() {
      await instance.dispose();
      instance = new Miniflare(options);
    },
    /** Runs one statement against the room's SQLite file with the runtime down, as a repair outside the Worker would. */
    async offline(statement) {
      await instance.dispose();
      const roomDirectory = join(persistence, 'do', '-GameRoom');
      const [file] = (await readdir(roomDirectory)).filter(
        (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite'
      );
      const database = new DatabaseSync(join(roomDirectory, file));
      try {
        return database.prepare(statement).all();
      } finally {
        database.close();
        instance = new Miniflare(options);
      }
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

/** Redeems one synthetic ticket for the registration suffix and waits for the first view. */
export async function admitPlayer(peer, runtime, suffix) {
  peer.registrationId = `registration-${suffix}`;
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  await connection.message('view');
  return connection;
}

/** Asks for a fresh full view and returns it, ignoring views that were already queued. */
export async function syncView(connection) {
  const before = connection.messages.length;
  connection.send({ type: 'sync' });
  return eventually(() => connection.messages.slice(before).find((message) => message.type === 'view'), 'fresh view');
}

/** Sends one command against the current revision and returns it with its rejection or completion. */
export async function sendCommand(connection, action, commandId = crypto.randomUUID(), expectedRevision) {
  const view = await syncView(connection);
  const message = {
    type: 'command',
    commandId,
    action,
    expectedRevision: expectedRevision ?? view.snapshot.revision,
  };
  const before = connection.messages.length;
  connection.send(message);
  return {
    message,
    reply: await eventually(
      () =>
        connection.messages
          .slice(before)
          .find((entry) =>
            entry.type === 'rejected' ? entry.requestId === commandId : entry.completedCommandId === commandId
          ),
      'command result'
    ),
  };
}

export function provision(runtime) {
  return runtime.fetch(`/__play/games/${gameId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, secret, attemptId }),
  });
}
