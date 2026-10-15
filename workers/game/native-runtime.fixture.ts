import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SQLOutputValue } from 'node:sqlite';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import type { IncomingRequestCfProperties, SqlStorageValue } from '@cloudflare/workers-types/experimental/index.ts';
import type { FunctionArgs } from 'convex/server';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { RequestInit, V4WorkerdStructuredLog } from 'miniflare';
import { WebSocketServer } from 'ws';
import type { WebSocket as PeerSocket, RawData } from 'ws';
import { z } from 'zod';

import type { api } from '../../convex/_generated/api';
import type { HistoricalFactionPublicationObject } from '../../src/shared/factions/schema';
import type { homepageAdmissionSchema } from '../../src/shared/homepage/protocol';
import type { homepageMessageSchema } from '../../src/shared/homepage/protocol';
import type {
  playWatchAuthorizationsResultSchema,
  playGameProvisionSchema,
  playReconcileAccountsResultSchema,
  playTestStartStageSchema,
} from '../../src/shared/play/admission';
import {
  playWatchAuthorizationsRequestSchema,
  playReconcileAccountsRequestSchema,
  playProvisionRequestSchema,
  playProvisionFailureSchema,
  playRedeemTicketRequestSchema,
  playAckAccountDeletionRequestSchema,
} from '../../src/shared/play/admission';
import type { AssetSupply, RulesetSupply, RulesetCapture, FactionCapture } from '../../src/shared/play/capture';
import type { factionDefinitionSchema } from '../../src/shared/play/capture';
import { playPublishSummaryRequestSchema } from '../../src/shared/play/directory';
import type { DraftFaction } from '../../src/shared/play/drafting';
import type { loadRoomCeilingSchema, loadCellIdentitySchema } from '../../src/shared/play/loadTarget';
import {
  KEEPALIVE_PING,
  KEEPALIVE_PONG,
  serverMessageSchema,
  serverClockSchema,
} from '../../src/shared/play/protocol.ts';
import type { ServerMessage, ClientMessage, PieceAction, ServerClock } from '../../src/shared/play/protocol.ts';
import type { RoomView } from '../../src/shared/play/updates.ts';
import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import type { StoredSnapshot, storedSnapshotSchema } from './state';

type WatchArgs = z.infer<typeof playWatchAuthorizationsRequestSchema>;
type WatchResult = Extract<z.infer<typeof playWatchAuthorizationsResultSchema>, { ok: true }>;
type AccountResult = Extract<z.infer<typeof playReconcileAccountsResultSchema>, { ok: true }>;
type Allowed = boolean | ((registrationId: string) => boolean);
export type NativeMessage = ServerMessage & Partial<ServerClock>;
export type NativeView = RoomView & Partial<ServerClock>;
const assetTypesArgsSchema = z.object({ types: z.array(z.string()) }) satisfies z.ZodType<
  FunctionArgs<typeof api.assets.listByTypes>
>;
const peerBodySchema = z.object({ path: z.string(), args: z.tuple([z.unknown()]) });
const frameTypeSchema = z.object({ type: z.string() });
const optionalClockSchema = serverClockSchema.partial();
const peerRequestSchema = z.discriminatedUnion('function', [
  z.object({ function: z.literal('assets:listByTypes'), args: assetTypesArgsSchema }),
  z.object({
    function: z.literal('playCatalogue:assetSupply'),
    args: z.object({ type: z.string(), slug: z.string() }),
  }),
  z.object({ function: z.literal('playCatalogue:rulesetSupply'), args: z.object({ rulesetId: z.string() }) }),
  z.object({ function: z.literal('playCatalogue:factionDefinition'), args: z.object({ factionId: z.string() }) }),
  z.object({ function: z.literal('playCatalogue:draftableFactions'), args: z.object({ rulesetId: z.string() }) }),
  z.object({ function: z.literal('playAdmission:watchAuthorizations'), args: playWatchAuthorizationsRequestSchema }),
  z.object({ function: z.literal('playProvisioning:validateProvisioning'), args: playProvisionRequestSchema }),
  z.object({ function: z.literal('playProvisioning:confirmProvisioning'), args: playProvisionRequestSchema }),
  z.object({ function: z.literal('playProvisioning:failProvisioning'), args: playProvisionFailureSchema }),
  z.object({ function: z.literal('playDirectory:publishSummary'), args: playPublishSummaryRequestSchema }),
  z.object({ function: z.literal('homepageAdmission:redeemTicket'), args: z.object({ ticket: z.string() }) }),
  z.object({ function: z.literal('playAdmission:redeemTicket'), args: playRedeemTicketRequestSchema }),
  z.object({ function: z.literal('playAdmission:reconcileAccounts'), args: playReconcileAccountsRequestSchema }),
  z.object({ function: z.literal('playAdmission:ackAccountDeletion'), args: playAckAccountDeletionRequestSchema }),
]);
export type PeerRequest = z.infer<typeof peerRequestSchema> & {
  path: string | undefined;
  headers: IncomingMessage['headers'];
  startedAt: number;
  completedAt?: number;
  response: ServerResponse;
  // Tests may deliberately return malformed data to exercise the Worker's validation.
  release(value: unknown): void;
};
const queryModificationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Add'),
    queryId: z.number(),
    udfPath: z.string(),
    args: z.tuple([playWatchAuthorizationsRequestSchema]),
  }),
  z.object({ type: z.literal('Remove'), queryId: z.number() }),
]);
const querySetSchema = z.object({
  type: z.literal('ModifyQuerySet'),
  newVersion: z.number(),
  modifications: z.array(queryModificationSchema),
});
type PeerQuery = Extract<z.infer<typeof queryModificationSchema>, { type: 'Add' }>;
type PeerVersion = { querySet: number; identity: number; ts: string };
type PeerConnection = {
  socket: PeerSocket;
  path: string | undefined;
  queries: Map<number, PeerQuery>;
  querySet: number;
  version: PeerVersion;
};
type Subscription = { connection: PeerConnection; query: PeerQuery };
type TransitionModification =
  | { type: 'QueryUpdated'; queryId: number; value: WatchResult; logLines: string[]; journal: null }
  | { type: 'QueryFailed'; queryId: number; errorMessage: string; logLines: string[] };
export interface NativePeer {
  catalogue: Map<string, AssetSupply>;
  catalogueMode: 'allow' | 'hold';
  factionMode: 'allow' | 'hold' | 'error';
  draftableMode: 'allow' | 'error';
  rulesets: Map<string, RulesetSupply>;
  factions: Map<
    string,
    Omit<z.infer<typeof factionDefinitionSchema>, 'data'> & {
      data:
        | z.infer<typeof factionDefinitionSchema>['data']
        | (Omit<z.infer<typeof HistoricalFactionPublicationObject>, 'extraPhases'> & { extraPhases?: unknown[] });
    }
  >;
  draftable: DraftFaction[];
  game: z.infer<typeof playGameProvisionSchema> | null;
  provisional: boolean;
  testPhaseCooldownMs: number | undefined;
  testStartStage: z.infer<typeof playTestStartStageSchema> | undefined;
  directoryMode: 'ack' | 'hold' | 'error';
  reconcileMode: 'answer' | 'hold' | 'error';
  deletedAccounts: Set<string>;
  seatLimitReached: Set<string>;
  summaries: z.infer<typeof playPublishSummaryRequestSchema>[];
  connections: PeerConnection[];
  requests: PeerRequest[];
  frames: { type: string }[];
  httpMode: 'allow' | 'deny' | 'hold' | 'error';
  watchMode: 'manual' | 'allow' | 'deny';
  expiresAt: () => number;
  registrationId: string;
  redemptionRefusal: 'expired' | 'refused' | null;
  redemptionMode: 'answer' | 'error' | 'busy' | 'malformed';
  provisionExpiresAt: number;
  confirmed: boolean;
  holdFirstConfirmation: boolean;
  holdConfirmations: boolean;
  failConfirmationRetries: boolean;
  confirmationRequests: number;
  homepageAdmission?: z.infer<typeof homepageAdmissionSchema>;
  homepageAdmissionInvalid?: unknown;
  accountChecks(): Extract<PeerRequest, { function: 'playAdmission:reconcileAccounts' }>[];
  releaseAccounts(): void;
  result(args: WatchArgs, allowed?: Allowed, expiresAt?: number): WatchResult;
  answer(subscription: Subscription, allowed?: Allowed, expiresAt?: number): void;
  fail(subscription: Subscription, errorMessage?: string): void;
  latestQuery(): Subscription | undefined;
  query(predicate?: (subscription: Subscription) => boolean): Promise<Subscription>;
  url: string;
  close(): Promise<void>;
}
export type NativeBindings = Record<string, string | number | boolean> & { APPLICATION_ORIGIN?: string };
type CaptureResult<K extends 'ruleset' | 'faction'> =
  | { ok: true; record: K extends 'ruleset' ? RulesetCapture : FactionCapture }
  | { ok: false; message: string; record?: undefined };
type NativeLoadStatus = Pick<
  z.infer<typeof loadRoomCeilingSchema>,
  'messages' | 'incomingBytes' | 'requests' | 'connections'
> & {
  stopped: string | null;
  expiresAt: number;
  ceilings: z.infer<typeof loadRoomCeilingSchema>;
  cell: z.infer<typeof loadCellIdentitySchema> | null;
  alarm: number | null;
  gameRows: number;
  historyRows: number;
};
export type NativeRuntime = Awaited<ReturnType<typeof createRuntime>>;
export interface NativeConnection {
  socket: NonNullable<Awaited<ReturnType<Miniflare['dispatchFetch']>>['webSocket']>;
  messages: NativeMessage[];
  unapplied: Extract<NativeMessage, { type: 'update' }>[];
  keepalives: number;
  closed: boolean;
  closeCode: number | null;
  send(message: ClientMessage | z.infer<typeof homepageMessageSchema>): void;
  /** Sends deliberately invalid input in protocol security tests. */
  sendInvalid(message: unknown): void;
  keepalive(): void;
  message<K extends NativeMessage['type']>(
    type: K,
    predicate?: (message: Extract<NativeMessage, { type: K }>) => boolean
  ): Promise<Extract<NativeMessage, { type: K }>>;
}

/** Decodes responses from the test-only adapter, whose endpoint owns this result shape. */
async function fixtureJson<T>(response: { json(): Promise<unknown> }): Promise<T> {
  return (await response.json()) as T;
}

/** A test expects this value to exist at this point in the flow. */
export function required<T>(value: T, message = 'Expected the fixture value to exist'): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

const directory = dirname(fileURLToPath(import.meta.url));
const repository = join(directory, '../..');
const gameId = 'fixture-game';
const secret = 'a'.repeat(64);
const attemptId = 'b'.repeat(64);
const stamp = (number: number) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(number));
  return bytes.toString('base64');
};

/*
 * The waits in progress.
 * A game socket frame ends each one early, so a wait for a reply reads again as the reply arrives instead of on its next tick.
 */
const waiting = new Set<() => void>();
function wake() {
  for (const done of waiting) {
    done();
  }
}

export async function eventually<T>(
  read: () => T | Promise<T>,
  label: string,
  timeout = 5000
): Promise<Exclude<T, false | null | undefined | 0 | ''>> {
  const deadline = Date.now() + timeout;
  do {
    const value = await read();
    if (value) {
      return value as Exclude<T, false | null | undefined | 0 | ''>;
    }
    await new Promise<void>((resolve) => {
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

async function readPeerRequest(request: IncomingMessage, response: ServerResponse): Promise<PeerRequest> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = peerBodySchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
  const parsed = peerRequestSchema.parse({ function: body.path, args: body.args[0] });
  const record: PeerRequest = {
    ...parsed,
    path: request.url,
    headers: request.headers,
    startedAt: Date.now(),
    response,
    release(value: unknown) {
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

function confirmationUnavailable(peer: NativePeer) {
  return peer.failConfirmationRetries && peer.confirmationRequests > 1;
}

function answerConfirmation(peer: NativePeer, record: PeerRequest) {
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

/* A user a test lists in `peer.seatLimitReached` is admitted as already holding the most seats one player may. */
function redeemedIdentity(peer: NativePeer) {
  const suffix = peer.registrationId.split('-').at(-1) ?? '';
  const userId = `user-${suffix}`;
  return {
    ...(peer.seatLimitReached.has(userId) ? { seatLimitReached: true } : {}),
    ok: true,
    registrationId: peer.registrationId,
    userId,
    sessionId: `session-${suffix}`,
    authExpiresAt: peer.expiresAt(),
    displayName: `Synthetic ${suffix.toUpperCase()}`,
    profileSlug: `synthetic-${suffix}`,
  };
}

/* Every account is active unless a test lists it in `peer.deletedAccounts`, which reads as a confirmed deletion. */
function accountStates(
  peer: NativePeer,
  record: Extract<PeerRequest, { function: 'playAdmission:reconcileAccounts' }>
): AccountResult {
  return {
    ok: true,
    accounts: record.args.userIds.map((userId) =>
      peer.deletedAccounts.has(userId)
        ? { userId, state: 'deletion_pending', deletionOperationId: `operation-${userId}` }
        : { userId, state: 'active', deletionOperationId: null }
    ),
  };
}

function answerPeerRequest(peer: NativePeer, record: PeerRequest) {
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
    case 'homepageAdmission:redeemTicket':
      record.release(
        'homepageAdmissionInvalid' in peer
          ? peer.homepageAdmissionInvalid
          : (peer.homepageAdmission ?? { allowed: false })
      );
      break;
    case 'playAdmission:redeemTicket':
      /*
       * A test that sets `peer.redemptionRefusal` has Convex refuse the ticket with that reason instead of redeeming it.
       * `peer.redemptionMode` set to `error` fails the request as an outage would, `busy` answers as rate-limited Convex does; `malformed` answers in a shape no deployment sends.
       */
      if (peer.redemptionMode === 'error') {
        record.response.writeHead(503);
        record.response.end('Redemption unavailable');
      } else if (peer.redemptionMode === 'busy') {
        record.response.writeHead(429);
        record.response.end('Too many requests');
      } else if (peer.redemptionMode === 'malformed') {
        record.release({ ok: true, registrationId: peer.registrationId });
      } else {
        record.release(peer.redemptionRefusal ? { ok: false, reason: peer.redemptionRefusal } : redeemedIdentity(peer));
      }
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
  }
}

function modifyQueries(connection: PeerConnection, message: z.infer<typeof querySetSchema>) {
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
export async function createPeer(): Promise<NativePeer> {
  const peer: NativePeer = {
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
    seatLimitReached: new Set(),
    summaries: [],
    connections: [],
    requests: [],
    frames: [],
    httpMode: 'allow',
    watchMode: 'manual',
    expiresAt: () => Date.now() + 60_000,
    registrationId: 'registration-a',
    redemptionRefusal: null,
    redemptionMode: 'answer',
    provisionExpiresAt: Date.now() + 60_000,
    confirmed: false,
    holdFirstConfirmation: false,
    holdConfirmations: false,
    failConfirmationRetries: false,
    confirmationRequests: 0,
    url: '',
    accountChecks,
    releaseAccounts,
    result,
    answer,
    fail,
    latestQuery,
    query,
    close,
  };
  let timestamp = 0;
  function transition(connection: PeerConnection, modifications: TransitionModification[] = []) {
    const next = { querySet: connection.querySet, identity: 0, ts: stamp(++timestamp) };
    connection.socket.send(
      JSON.stringify({ type: 'Transition', startVersion: connection.version, endVersion: next, modifications })
    );
    connection.version = next;
  }
  function accountChecks() {
    return peer.requests.filter(
      (record): record is Extract<PeerRequest, { function: 'playAdmission:reconcileAccounts' }> =>
        record.function === 'playAdmission:reconcileAccounts'
    );
  }
  /* Answers every account check that `hold` kept open, and every later one at once. */
  function releaseAccounts() {
    peer.reconcileMode = 'answer';
    for (const record of peer.accountChecks()) {
      if (!record.response.writableEnded) {
        record.release(accountStates(peer, record));
      }
    }
  }
  /* `allowed` may be a predicate on the registration id, so one result can deny one registration only. */
  function result(args: WatchArgs, allowed: Allowed = true, expiresAt = peer.expiresAt()): WatchResult {
    return {
      ok: true,
      generation: args.generation,
      entries: args.registrationIds.map((registrationId: string) => {
        const suffix = registrationId.split('-').at(-1);
        return {
          registrationId,
          userId: `user-${suffix}`,
          sessionId: `session-${suffix}`,
          allowed: typeof allowed === 'function' ? allowed(registrationId) : allowed,
          authExpiresAt: expiresAt,
        };
      }),
    };
  }
  function answer({ connection, query }: Subscription, allowed: Allowed = true, expiresAt = peer.expiresAt()) {
    transition(connection, [
      {
        type: 'QueryUpdated',
        queryId: query.queryId,
        value: peer.result(query.args[0], allowed, expiresAt),
        logLines: [],
        journal: null,
      },
    ]);
  }
  function fail({ connection, query }: Subscription, errorMessage = 'query failed') {
    transition(connection, [{ type: 'QueryFailed', queryId: query.queryId, errorMessage, logLines: [] }]);
  }
  function latestQuery(): Subscription | undefined {
    const connection = peer.connections.at(-1);
    const query = connection && [...connection.queries.values()].at(-1);
    return connection && query ? { connection, query } : undefined;
  }
  function query(predicate: (subscription: Subscription) => boolean = () => true) {
    return eventually(() => {
      const current = peer.latestQuery();
      return current && predicate(current) && current;
    }, 'native subscription');
  }
  const server = createServer(async (request, response) => {
    let record;
    try {
      record = await readPeerRequest(request, response);
    } catch (error) {
      /* The Worker can cancel a call before its body arrives, as a retried command does; there is nothing left to answer. */
      if (error instanceof Error && 'code' in error && error.code === 'ECONNRESET') {
        return;
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'error', errorMessage: error.message }));
        return;
      }
      throw error;
    }
    peer.requests.push(record);
    answerPeerRequest(peer, record);
  });
  function publishQueries(connection: PeerConnection) {
    if (peer.watchMode === 'manual') {
      return;
    }
    for (const query of connection.queries.values()) {
      peer.answer({ connection, query }, peer.watchMode === 'allow');
    }
  }
  function receiveQuerySet(connection: PeerConnection, data: RawData) {
    /* A frame arrives as one Buffer, an ArrayBuffer or Buffer fragments depending on the socket's binaryType, and only a Buffer prints as its text. */
    const input: unknown = JSON.parse(
      (Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)).toString()
    );
    const message = frameTypeSchema.parse(input);
    peer.frames.push(message);
    if (message.type !== 'ModifyQuerySet') {
      return;
    }
    modifyQueries(connection, querySetSchema.parse(input));
    // An acknowledged subscription is deliberately not a fresh authorization snapshot.
    transition(connection);
    publishQueries(connection);
  }
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket, request) => {
    const connection: PeerConnection = {
      socket,
      path: request.url,
      queries: new Map(),
      querySet: 0,
      version: { querySet: 0, identity: 0, ts: stamp(0) },
    };
    peer.connections.push(connection);
    socket.on('message', (data) => receiveQuerySet(connection, data));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The peer did not bind a TCP port.');
  }
  peer.url = `http://127.0.0.1:${address.port}`;
  async function close() {
    for (const connection of peer.connections) {
      connection.socket.terminate();
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return peer;
}

export async function createRuntime(
  peer: NativePeer,
  kind: 'probe' | 'game' | 'load' | 'homepage' = 'probe',
  bindings: NativeBindings = {}
) {
  const logs: V4WorkerdStructuredLog[] = [];
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
          homepage: 'homepage.native.fixture.ts',
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
  const configure = (overrides: NativeBindings = {}) =>
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
          : kind === 'homepage'
            ? { HOMEPAGE_ROOMS: { className: 'HomepageRoom', useSQLite: true } }
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
    async clock(offset: number) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      return fixtureJson<{ now: number }>(await room.fetch(`https://native-test/native-test/clock?offset=${offset}`));
    },
    async audit() {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      return fixtureJson<
        Array<{
          receipt_key: string;
          user_id: string | null;
          display_name: string;
          action: string;
          contents: string | null;
          created_at: number;
        }>
      >(await room.fetch('https://native-test/native-test/audit'));
    },
    async exec<Row extends Record<string, SqlStorageValue>>(
      statement: string,
      params: SqlStorageValue[] = []
    ): Promise<Row[]> {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch('https://native-test/native-test/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement, params }),
      });
      return fixtureJson<Row[]>(response);
    },
    async failStorage() {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      await room.fetch('https://native-test/native-test/fail-storage', { method: 'POST' });
    },
    async capture<K extends 'ruleset' | 'faction'>(
      kind: K,
      id: string,
      { provisional = false } = {}
    ): Promise<CaptureResult<K>> {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch('https://native-test/native-test/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, provisional }),
      });
      return fixtureJson<CaptureResult<K>>(response);
    },
    async captures() {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      return fixtureJson<{ ruleset: RulesetCapture | null; factions: FactionCapture[] }>(
        await room.fetch('https://native-test/native-test/captures')
      );
    },
    async loadControl(stop = false) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch(`https://native-test/native-test/load-${stop ? 'stop' : 'status'}`);
      return fixtureJson<NativeLoadStatus>(response);
    },
    fetch(path: string, init?: RequestInit<Partial<IncomingRequestCfProperties>>) {
      return instance.dispatchFetch(`${origin}${path}`, init);
    },
    async request(path: string) {
      return fixtureJson<{
        status: 'suspended' | 'authorized' | 'denied';
        latestRound: number;
        events: string[];
        runtime: { hasWindow: boolean; userAgent: string };
      }>(await this.fetch(path));
    },
    async alarm(advance = false) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      const room = namespace.get(namespace.idFromName(gameId));
      const response = await room.fetch('https://native-test/native-test/alarm', { method: advance ? 'POST' : 'GET' });
      return fixtureJson<{ scheduledAt: number | null; observedAt: number }>(response);
    },
    /** Restarts the runtime, as a new Worker version does, optionally with changed bindings. */
    async restart(overrides?: NativeBindings) {
      await instance.dispose();
      if (overrides) {
        options = configure(overrides);
      }
      instance = new Miniflare(options);
    },
    /** Evicts the homepage's in-memory room while keeping its native WebSockets connected. */
    async hibernateHomepage() {
      await instance.unsafeEvictDurableObject('', 'HomepageRoom', {
        name: 'public-homepage',
        webSockets: 'hibernate',
      });
    },
    /** Fetches a path from the room object with any name, as a Worker version routing another game would. */
    async object(name: string, path: string) {
      const namespace = await instance.getDurableObjectNamespace('GAME_ROOMS');
      return namespace.get(namespace.idFromName(name)).fetch(`https://native-test${path}`);
    },
    /**
     * Runs one statement against the room's SQLite file with the runtime down.
     * A read through the Worker constructs the room and runs its startup repair first, so a failed repair can only be observed this way before the next start.
     */
    async offline<Row extends Record<string, SQLOutputValue>>(statement: string): Promise<Row[]> {
      await instance.dispose();
      const roomDirectory = join(persistence, 'do', '-GameRoom');
      const [file] = (await readdir(roomDirectory)).filter(
        (name: string) => name.endsWith('.sqlite') && name !== 'metadata.sqlite'
      );
      const database = new DatabaseSync(join(roomDirectory, file));
      try {
        return database.prepare(statement).all() as Row[];
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
const applied = new WeakSet<object>();

/** Whether a message is a full view the Worker sent, not one assembled from an update. */
export const isFullView = (message: NativeMessage): message is NativeView =>
  message.type === 'view' && !applied.has(message);

/**
 * Opens a socket that records every frame it receives.
 * After each update it also records the view that update produces on the one before it, with the update's clock readings, as the page holds it.
 * An update that does not apply to the view before it goes to `unapplied` instead.
 * A test then waits for a table state whichever frame carried it.
 */
export async function openGame(runtime: NativeRuntime, path = `/__play/games/${gameId}/socket`) {
  const response = await runtime.fetch(path, {
    headers: { Origin: runtime.origin, Upgrade: 'websocket' },
  });
  if (response.status !== 101) {
    throw new Error(`Socket refused: ${response.status}`);
  }
  const socket = response.webSocket;
  if (!socket) {
    throw new Error('The upgrade did not provide a WebSocket.');
  }
  const connection: NativeConnection = {
    socket,
    messages: [],
    unapplied: [],
    keepalives: 0,
    closed: false,
    closeCode: null,
    send: (message) => socket.send(JSON.stringify(message)),
    sendInvalid: (message) => socket.send(JSON.stringify(message)),
    keepalive: () => socket.send(KEEPALIVE_PING),
    message<K extends NativeMessage['type']>(
      type: K,
      predicate: (message: Extract<NativeMessage, { type: K }>) => boolean = () => true
    ) {
      return eventually(
        () =>
          connection.messages.find(
            (message): message is Extract<NativeMessage, { type: K }> =>
              message.type === type && predicate(message as Extract<NativeMessage, { type: K }>)
          ),
        type
      );
    },
  };
  let current: NativeView | undefined;
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      throw new Error('The room sent a binary frame.');
    }
    if (event.data === KEEPALIVE_PONG) {
      connection.keepalives++;
      wake();
      return;
    }
    const raw: unknown = JSON.parse(event.data);
    serverMessageSchema.parse(raw);
    optionalClockSchema.parse(raw);
    // Keep the original frame, including unexpected fields that privacy assertions must observe.
    const message = raw as NativeMessage;
    connection.messages.push(message);
    if (message.type === 'view') {
      current = message;
    } else if (message.type === 'update') {
      const view = applyRoomUpdate(current ?? undefined, message);
      const { phaseCooldownMs, battleCountdownMs, serverNow } = message;
      current = view ? { ...view, phaseCooldownMs, battleCountdownMs, serverNow } : undefined;
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
  return connection;
}

/** Redeems one synthetic ticket for the registration suffix and waits for the first view. */
export async function admitPlayer(peer: NativePeer, runtime: NativeRuntime, suffix: string) {
  peer.registrationId = `registration-${suffix}`;
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', supportsBoard: true, ticket: 'c'.repeat(64) });
  await connection.message('view');
  return connection;
}

/** Asks for a fresh full view and returns it, ignoring views that were already queued. */
export async function syncView(connection: NativeConnection) {
  const before = connection.messages.length;
  connection.send({ type: 'sync' });
  return eventually(() => connection.messages.slice(before).find(isFullView), 'fresh view');
}

/** Sends one command against the current revision and returns it with its rejection or completion. */
export async function sendCommand(
  connection: NativeConnection,
  action: PieceAction,
  commandId: string = crypto.randomUUID(),
  expectedRevision?: number
) {
  const view = await syncView(connection);
  const message = {
    type: 'command' as const,
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
          .find((entry): entry is Extract<NativeMessage, { type: 'rejected' | 'view' | 'update' }> =>
            entry.type === 'rejected'
              ? entry.requestId === commandId
              : 'completedCommandId' in entry && entry.completedCommandId === commandId
          ),
      'command result'
    ),
  };
}

/** Sends one command that has to be accepted and returns the sender's fresh view afterwards. */
export async function accepted(connection: NativeConnection, action: PieceAction, commandId?: string) {
  const { reply } = await sendCommand(connection, action, commandId);
  if (reply.type === 'rejected') {
    throw new Error(`The ${action.kind} command was rejected: ${JSON.stringify(reply)}`);
  }
  return syncView(connection);
}

/** Seats a spectator through one player's approval, at the named seat if given, and returns the newcomer's view. */
export async function seat(newcomer: NativeConnection, approver: NativeConnection, target?: string) {
  const requested = await accepted(newcomer, { kind: 'seat-request', ...(target ? { seat: target } : {}) });
  const request = requested.snapshot.controls?.seatRequests.find((entry) => entry.own);
  if (!request) {
    throw new Error('The newcomer did not create a seat request.');
  }
  await accepted(approver, { kind: 'seat-approve', requestId: request.id });
  return syncView(newcomer);
}

export const stage = async (connection: NativeConnection) => (await syncView(connection)).snapshot.stage;

/** Every table event message the room stores, in its current state and in each retained history row. */
export async function storedEventMessages(runtime: NativeRuntime) {
  const rows = await runtime.exec<{ data: string }>(
    'SELECT data FROM current_state UNION ALL SELECT data FROM history'
  );
  return rows.flatMap((row: { data: string }) =>
    [...row.data.matchAll(/"message":"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])
  );
}

export function provision(runtime: NativeRuntime) {
  return runtime.fetch(`/__play/games/${gameId}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, secret, attemptId }),
  });
}

/** Requires the expected message before a test reads that message's fields. */
export function messageOf<K extends NativeMessage['type']>(
  message: NativeMessage,
  type: K
): Extract<NativeMessage, { type: K }> {
  if (message.type !== type) {
    throw new Error(`Expected ${type}, received ${message.type}.`);
  }
  return message as Extract<NativeMessage, { type: K }>;
}

/** Reads persisted inputs before a test seeds the shape a previous release wrote. */
export function readHistoricalSnapshot(text: string): z.input<typeof storedSnapshotSchema> {
  return JSON.parse(text) as z.input<typeof storedSnapshotSchema>;
}

/** Reads the exact persisted snapshot without stripping fields that storage assertions inspect. */
export function readSnapshot(text: string): StoredSnapshot {
  return JSON.parse(text) as StoredSnapshot;
}
