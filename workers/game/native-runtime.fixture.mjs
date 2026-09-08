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

/** A local protocol peer, not an Auth implementation. Tests control the observation order. */
export async function createPeer() {
  const peer = {
    connections: [],
    requests: [],
    frames: [],
    httpMode: 'allow',
    watchMode: 'manual',
    expiresAt: () => Date.now() + 60_000,
    provisionExpiresAt: Date.now() + 60_000,
    confirmed: false,
    holdFirstConfirmation: false,
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
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const args = body.args[0];
    const record = {
      path: request.url,
      function: body.path,
      args,
      headers: request.headers,
      startedAt: Date.now(),
      response,
    };
    record.release = (value) => {
      if (!response.destroyed) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'success', value, logLines: [] }));
      }
    };
    peer.requests.push(record);
    switch (body.path) {
      case 'playAdmission:watchAuthorizations':
        if (peer.httpMode !== 'hold') {
          record.release(peer.result(args, peer.httpMode === 'allow'));
        }
        break;
      case 'playProvisioning:validateProvisioning':
        record.release({ ok: true, gameId, attemptId, fixtureKey: 'hosted-demo', expiresAt: peer.provisionExpiresAt });
        break;
      case 'playProvisioning:confirmProvisioning':
        peer.confirmationRequests++;
        peer.confirmed ||= Date.now() < peer.provisionExpiresAt;
        if (!(peer.holdFirstConfirmation && peer.confirmationRequests === 1)) {
          record.release({ ok: peer.confirmed });
        }
        break;
      case 'playAdmission:redeemTicket':
        record.release({
          ok: true,
          registrationId: 'registration-a',
          userId: 'user-a',
          sessionId: 'session-a',
          authExpiresAt: peer.expiresAt(),
          displayName: 'Synthetic A',
        });
        break;
      case 'playAdmission:reconcileAccounts':
        record.release({
          ok: true,
          accounts: args.userIds.map((userId) => ({ userId, state: 'active', deletionOperationId: null })),
        });
        break;
      case 'playAdmission:ackAccountDeletion':
        record.release(null);
        break;
      default:
        response.writeHead(404);
        response.end();
    }
  });
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
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      peer.frames.push(message);
      if (message.type !== 'ModifyQuerySet') {
        return;
      }
      connection.querySet = message.newVersion;
      for (const change of message.modifications) {
        if (change.type === 'Add') {
          connection.queries.set(change.queryId, change);
        } else {
          connection.queries.delete(change.queryId);
        }
      }
      // An acknowledged subscription is deliberately not a fresh authorization snapshot.
      transition(connection);
      if (peer.watchMode !== 'manual') {
        for (const query of connection.queries.values()) {
          peer.answer({ connection, query }, peer.watchMode === 'allow');
        }
      }
    });
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
