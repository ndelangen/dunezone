import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { WebSocketServer } from 'ws';

import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol.ts';
import { applyRoomUpdate } from '../../src/shared/play/updates.ts';

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

/*
 * The waits in progress.
 * A game socket frame ends each one early, so a wait for a reply reads again as the reply arrives instead of on its next tick.
 */
const waiting = new Set();
function wake() {
  for (const done of waiting) {
    done();
  }
}

export async function eventually(read, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (value) {
      return value;
    }
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiting.delete(done);
        resolve();
      };
      const timer = setTimeout(done, 15);
      waiting.add(done);
    });
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
    profileSlug: `synthetic-${suffix}`,
  };
}

/* Every account is active unless a test lists it in `peer.deletedAccounts`, which reads as a confirmed deletion. */
function accountStates(peer, record) {
  return {
    ok: true,
    accounts: record.args.userIds.map((userId) =>
      peer.deletedAccounts.has(userId)
        ? { userId, state: 'deletion_pending', deletionOperationId: `operation-${userId}` }
        : { userId, state: 'active', deletionOperationId: null }
    ),
  };
}

function answerPeerRequest(peer, record) {
  switch (record.function) {
    case 'assets:listByTypes':
      record.release([...peer.catalogue.values()].map((page) => page.asset));
      break;
    case 'playCatalogue:assetSupply':
      if (peer.catalogueMode !== 'hold') {
        record.release(peer.catalogue.get(`${record.args.type}/${record.args.slug}`) ?? null);
      }
      break;
    case 'playCatalogue:rulesetSupply':
      record.release(peer.rulesets.get(record.args.rulesetId) ?? null);
      break;
    case 'playCatalogue:factionDefinition':
      /* `hold` keeps a capture open until the test releases it; `error` fails it outright. */
      if (peer.factionMode === 'error') {
        record.response.writeHead(500);
        record.response.end('Catalogue unavailable');
      } else if (peer.factionMode !== 'hold') {
        record.release(peer.factions.get(record.args.factionId) ?? null);
      }
      break;
    case 'playCatalogue:draftableFactions':
      /* The draft's catalogue: every entry a test put in `peer.draftable`, whatever the ruleset asked; `error` fails the read. */
      if (peer.draftableMode === 'error') {
        record.response.writeHead(500);
        record.response.end('Catalogue unavailable');
      } else {
        record.release({ factions: peer.draftable });
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
      /* A test that sets `peer.game` provisions a real game instead of the fixture. */
      record.release({
        ok: true,
        gameId,
        attemptId,
        expiresAt: peer.provisionExpiresAt,
        ...(peer.game ? { game: peer.game, provisional: peer.provisional } : { fixtureKey: 'hosted-demo' }),
        /* A test that sets `peer.testPhaseCooldownMs` has the backend provision the game with that cooldown. */
        ...(peer.testPhaseCooldownMs === undefined ? {} : { testPhaseCooldownMs: peer.testPhaseCooldownMs }),
        /* A test that sets `peer.testStartStage` has the backend ask for the game provisioned at that stage. */
        ...(peer.testStartStage === undefined ? {} : { testStartStage: peer.testStartStage }),
      });
      break;
    case 'playProvisioning:confirmProvisioning':
      answerConfirmation(peer, record);
      break;
    case 'playDirectory:publishSummary':
      /* The directory: `ack` acknowledges the delivered sequence, `hold` keeps the request open, `error` fails it. */
      peer.summaries.push(record.args);
      if (peer.directoryMode === 'error') {
        record.response.writeHead(503);
        record.response.end('Directory unavailable');
      } else if (peer.directoryMode !== 'hold') {
        record.release({ ok: true, sequence: record.args.sequence });
      }
      break;
    case 'playProvisioning:failProvisioning':
      record.release({ ok: true });
      break;
    case 'playAdmission:redeemTicket':
      /* A test that sets `peer.redemptionRefusal` has Convex refuse the ticket with that reason instead of redeeming it. */
      record.release(peer.redemptionRefusal ? { ok: false, reason: peer.redemptionRefusal } : redeemedIdentity(peer));
      break;
    case 'playAdmission:reconcileAccounts':
      /* The room's account check: `hold` keeps it open until `peer.releaseAccounts()` answers it, `error` fails it. */
      if (peer.reconcileMode === 'error') {
        record.response.writeHead(500);
        record.response.end('Accounts unavailable');
      } else if (peer.reconcileMode !== 'hold') {
        record.release(accountStates(peer, record));
      }
      break;
    case 'playAdmission:ackAccountDeletion':
      record.release(null);
      break;
    default:
      record.response.writeHead(404);
      record.response.end(`Could not find public function for '${record.function}'.`);
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
    factionMode: 'allow',
    draftableMode: 'allow',
    rulesets: new Map(),
    factions: new Map(),
    draftable: [],
    game: null,
    provisional: true,
    testPhaseCooldownMs: undefined,
    testStartStage: undefined,
    directoryMode: 'ack',
    reconcileMode: 'answer',
    deletedAccounts: new Set(),
    summaries: [],
    connections: [],
    requests: [],
    frames: [],
    httpMode: 'allow',
    watchMode: 'manual',
    expiresAt: () => Date.now() + 60_000,
    registrationId: 'registration-a',
    redemptionRefusal: null,
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
  peer.accountChecks = () => peer.requests.filter((record) => record.function === 'playAdmission:reconcileAccounts');
  /* Answers every account check that `hold` kept open, and every later one at once. */
  peer.releaseAccounts = () => {
    peer.reconcileMode = 'answer';
    for (const record of peer.accountChecks()) {
      if (!record.response.writableEnded) {
        record.release(accountStates(peer, record));
      }
    }
  };
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
    let record;
    try {
      record = await readPeerRequest(request, response);
    } catch (error) {
      /* The Worker can cancel a call before its body arrives, as a retried command does; there is nothing left to answer. */
      if (error?.code === 'ECONNRESET') {
        return;
      }
      throw error;
    }
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
  const origin = bindings.APPLICATION_ORIGIN ?? 'http://table.test';
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
  const configure = (overrides = {}) =>
    convertV4MiniflareOptions({
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
        APPLICATION_ORIGIN: origin,
        GIT_SHA: 'native-test',
        CF_VERSION_METADATA: { id: 'native-test', tag: 'native-test' },
        ...bindings,
        ...overrides,
      },
    });
  let options = configure();
  let instance = new Miniflare(options);
  await instance.ready;
  return {
    logs,
    origin,
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
    async capture(kind, id, { provisional = false } = {}) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch('https://native-test/native-test/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, provisional }),
      });
      return response.json();
    },
    async captures() {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      return (await room.fetch('https://native-test/native-test/captures')).json();
    },
    async loadControl(stop = false) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch(`https://native-test/native-test/load-${stop ? 'stop' : 'status'}`);
      return response.json();
    },
    fetch(path, init) {
      return instance.dispatchFetch(`${origin}${path}`, init);
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
    /** Restarts the runtime, as a new Worker version does, optionally with changed bindings. */
    async restart(overrides) {
      await instance.dispose();
      if (overrides) {
        options = configure(overrides);
      }
      instance = new Miniflare(options);
    },
    /** Fetches a path from the room object with any name, as a Worker version routing another game would. */
    async object(name, path) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      return namespace.get(namespace.idFromName(name)).fetch(`https://native-test${path}`);
    },
    /**
     * Runs one statement against the room's SQLite file with the runtime down.
     * A read through the Worker constructs the room and runs its startup repair first, so a failed repair can only be observed this way before the next start.
     */
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

/* Views a connection assembled from an update, as the page applies it; every other view came whole from the Worker. */
const applied = new WeakSet();

/** Whether a message is a full view the Worker sent, not one assembled from an update. */
export const isFullView = (message) => message.type === 'view' && !applied.has(message);

/**
 * Opens a socket that records every frame it receives.
 * After each update it also records the view that update produces on the one before it, with the update's clock readings, as the page holds it.
 * An update that does not apply to the view before it goes to `unapplied` instead.
 * A test then waits for a table state whichever frame carried it.
 */
export async function openGame(runtime) {
  const response = await runtime.fetch(`/__play/games/${gameId}/socket`, {
    headers: { Origin: runtime.origin, Upgrade: 'websocket' },
  });
  if (response.status !== 101) {
    throw new Error(`Socket refused: ${response.status}`);
  }
  const socket = response.webSocket;
  const connection = { socket, messages: [], unapplied: [], keepalives: 0, closed: false, closeCode: null };
  let current = null;
  socket.addEventListener('message', (event) => {
    if (event.data === KEEPALIVE_PONG) {
      connection.keepalives++;
      wake();
      return;
    }
    const message = JSON.parse(event.data);
    connection.messages.push(message);
    if (message.type === 'view') {
      current = message;
    } else if (message.type === 'update') {
      const view = applyRoomUpdate(current ?? undefined, message);
      const { phaseCooldownMs, battleCountdownMs, serverNow } = message;
      current = view && { ...view, phaseCooldownMs, battleCountdownMs, serverNow };
      if (current) {
        applied.add(current);
        connection.messages.push(current);
      } else {
        connection.unapplied.push(message);
      }
    }
    wake();
  });
  socket.addEventListener('close', (event) => {
    connection.closed = true;
    connection.closeCode = event.code;
    wake();
  });
  socket.accept();
  connection.send = (message) => socket.send(JSON.stringify(message));
  connection.keepalive = () => socket.send(KEEPALIVE_PING);
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
  return eventually(() => connection.messages.slice(before).find(isFullView), 'fresh view');
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

/** Sends one command that has to be accepted and returns the sender's fresh view afterwards. */
export async function accepted(connection, action, commandId) {
  const { reply } = await sendCommand(connection, action, commandId);
  if (reply.type === 'rejected') {
    throw new Error(`The ${action.kind} command was rejected: ${JSON.stringify(reply)}`);
  }
  return syncView(connection);
}

/** Seats a spectator through one player's approval, at the named seat if given, and returns the newcomer's view. */
export async function seat(newcomer, approver, target) {
  const requested = await accepted(newcomer, { kind: 'seat-request', ...(target ? { seat: target } : {}) });
  const request = requested.snapshot.controls.seatRequests.find((entry) => entry.own);
  await accepted(approver, { kind: 'seat-approve', requestId: request.id });
  return syncView(newcomer);
}

export const stage = async (connection) => (await syncView(connection)).snapshot.stage;

/** Every table event message the room stores, in its current state and in each retained history row. */
export async function storedEventMessages(runtime) {
  const rows = await runtime.exec('SELECT data FROM current_state UNION ALL SELECT data FROM history');
  return rows.flatMap((row) => [...row.data.matchAll(/"message":"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]));
}

export function provision(runtime) {
  return runtime.fetch(`/__play/games/${gameId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, secret, attemptId }),
  });
}
