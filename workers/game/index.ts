import { DurableObject } from 'cloudflare:workers';
import { makeFunctionReference } from 'convex/server';

import {
  PLAY_PENDING_TIMEOUT_MS,
  PLAY_AUTH_LEASE_MS,
  PLAY_AUTH_RENEWAL_MS,
  PLAY_AUTHORIZATION_BATCH_SIZE,
  PLAY_REDEEM_TICKET_FUNCTION,
  PLAY_VALIDATE_PROVISIONING_FUNCTION,
  PLAY_CONFIRM_PROVISIONING_FUNCTION,
  PLAY_RECONCILE_ACCOUNTS_FUNCTION,
  PLAY_ACK_ACCOUNT_DELETION_FUNCTION,
  playProvisionRequestSchema,
  playProvisioningValidationSchema,
  playConfirmationSchema,
  playRedeemTicketResultSchema,
  playAccountDeletionRequestSchema,
  playReconcileAccountsResultSchema,
} from '../../src/shared/play/admission';
import { initialSnapshot } from '../../src/shared/play/commands';
import { clientMessageSchema, gameSnapshotSchema } from '../../src/shared/play/protocol';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { AuthorizationWatch, gameHttpClient } from './authorization';
import { applyPatch, diff } from './history';
import type { Patch } from './history';
import { Room } from './room';

type Metadata = { gameId: string; secret: string; attemptId: string; expiresAt: number; confirmed: boolean };
type Connection = {
  connectionId: string;
  openedAt: number;
  admitting: boolean;
  viewer?: Viewer;
  registrationId?: string;
  sessionId?: string;
  announced: 'pending' | 'authorized' | 'suspended';
  everAuthorized: boolean;
  pointerSeq: number;
  tokens: number;
  refilledAt: number;
};
type Actor = { user_id: string; seat: Viewer['viewerSeat']; display_name: string; deleted: number };
type HistoryRow = {
  step: number;
  base_revision: number;
  revision: number;
  phase: number;
  kind: string;
  data: string;
  bytes: number;
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refused = () => json({ error: 'Request refused.' }, 403);
const credentialsMatch = (a: string, b: string) => {
  if (a.length !== 64 || b.length !== 64) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
};
async function readJson(request: Request): Promise<unknown> {
  if (!request.body || Number(request.headers.get('Content-Length') ?? 0) > 8192) {
    throw new Error('Request refused.');
  }
  const reader = request.body.getReader();
  let length = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > 8192) {
        throw new Error('Request refused.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export class GameRoom extends DurableObject<GameEnv> {
  private metadata: Metadata | undefined;
  private room: Room | undefined;
  private boundary: GameSnapshot | undefined;
  private historyStep = 0;
  private readonly connections = new Map<WebSocket, Connection>();
  private authorization: AuthorizationWatch | undefined;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private reconcilePromise: Promise<void> | undefined;
  private reconciled = false;
  private reconcileUntil = 0;
  private nextReconcileAt = 0;
  private reconcileEpoch = 0;
  private motionReceived = 0;
  private motionForwarded = 0;
  private messagesSent = 0;
  private bytesSent = 0;

  constructor(ctx: DurableObjectState, env: GameEnv) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS current_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    sql.exec(
      'CREATE TABLE IF NOT EXISTS history (step INTEGER PRIMARY KEY, base_revision INTEGER NOT NULL, revision INTEGER NOT NULL, phase INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS receipts (receipt_key TEXT PRIMARY KEY, actor_id TEXT, payload TEXT NOT NULL, revision INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS actors (user_id TEXT PRIMARY KEY, seat TEXT NOT NULL, display_name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS seat_history (id INTEGER PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, seat TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
    sql.exec('CREATE TABLE IF NOT EXISTS deletion_receipts (event_id TEXT PRIMARY KEY)');
    const metadata = sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    if (metadata) {
      this.metadata = JSON.parse(metadata.data) as Metadata;
      const stored = sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
      this.room = new Room(gameSnapshotSchema.parse(JSON.parse(stored.data)));
      this.historyStep = sql.exec<{ step: number }>('SELECT MAX(step) AS step FROM history').one().step;
      this.boundary = this.restoreHistory(this.historyStep);
    }
    /* A restored attachment or SQLite row is not an auth grant. Each tab redeems a fresh ticket. */
    for (const socket of ctx.getWebSockets()) {
      socket.close(1012, 'Reconnect to the table.');
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/__play\/games\/([a-zA-Z0-9_-]{1,128})\/(socket|provision|account-deletion)$/.exec(url.pathname);
    if (!match || url.search || url.origin !== this.env.APPLICATION_ORIGIN) {
      return refused();
    }
    const [, gameId, operation] = match;
    if (operation === 'provision' && request.method === 'POST') {
      try {
        const args = playProvisionRequestSchema.parse(await readJson(request));
        if (args.gameId !== gameId) {
          return refused();
        }
        return await this.ctx.blockConcurrencyWhile(async () => {
          if (this.metadata) {
            return refused();
          }
          const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
            makeFunctionReference<'mutation'>(PLAY_VALIDATE_PROVISIONING_FUNCTION),
            args
          );
          const validation = playProvisioningValidationSchema.parse(raw);
          if (
            !validation.ok ||
            validation.gameId !== gameId ||
            validation.attemptId !== args.attemptId ||
            validation.expiresAt <= Date.now()
          ) {
            return refused();
          }
          const snapshot = initialSnapshot();
          const data = JSON.stringify(snapshot);
          const metadata: Metadata = { ...args, expiresAt: validation.expiresAt, confirmed: false };
          this.ctx.storage.transactionSync(() => {
            this.ctx.storage.sql.exec('INSERT INTO metadata VALUES (1, ?)', JSON.stringify(metadata));
            this.ctx.storage.sql.exec('INSERT INTO current_state VALUES (1, ?)', data);
            this.ctx.storage.sql.exec(
              "INSERT INTO history VALUES (0, 0, 0, 0, 'checkpoint', ?, ?)",
              data,
              new TextEncoder().encode(data).byteLength
            );
          });
          this.metadata = metadata;
          this.room = new Room(snapshot);
          this.boundary = snapshot;
          await this.ctx.storage.setAlarm(Date.now() + 2000);
          await this.confirmProvisioning();
          return this.metadata.confirmed ? json({ ok: true }) : refused();
        });
      } catch {
        return refused();
      }
    }
    if (!this.metadata || this.metadata.gameId !== gameId) {
      return refused();
    }
    if (operation === 'account-deletion' && request.method === 'POST') {
      try {
        const args = playAccountDeletionRequestSchema.parse(await readJson(request));
        if (args.gameId !== gameId || !credentialsMatch(args.secret, this.metadata.secret)) {
          return refused();
        }
        this.reconcileEpoch++;
        this.deleteActor(args.userId, args.eventId);
        const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
          makeFunctionReference<'mutation'>(PLAY_ACK_ACCOUNT_DELETION_FUNCTION),
          {
            gameId,
            secret: this.metadata.secret,
            eventId: args.eventId,
          }
        );
        return raw === null ? json({ ok: true }) : refused();
      } catch {
        return refused();
      }
    }
    if (
      operation !== 'socket' ||
      request.method !== 'GET' ||
      !this.metadata.confirmed ||
      request.headers.get('Origin') !== this.env.APPLICATION_ORIGIN ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
    ) {
      return refused();
    }
    if (
      this.connections.size >= 128 ||
      [...this.connections.values()].filter((connection) => !connection.viewer).length >= 16
    ) {
      return refused();
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.connections.set(server, {
      connectionId: crypto.randomUUID(),
      openedAt: Date.now(),
      admitting: false,
      announced: 'pending',
      everAuthorized: false,
      pointerSeq: -1,
      tokens: 120,
      refilledAt: Date.now(),
    });
    this.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async alarm() {
    await this.confirmProvisioning();
  }

  private async confirmProvisioning() {
    const metadata = this.metadata;
    if (!metadata || metadata.confirmed) {
      return;
    }
    try {
      const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
        makeFunctionReference<'mutation'>(PLAY_CONFIRM_PROVISIONING_FUNCTION),
        {
          gameId: metadata.gameId,
          secret: metadata.secret,
          attemptId: metadata.attemptId,
        }
      );
      if (playConfirmationSchema.parse(raw).ok) {
        metadata.confirmed = true;
        this.ctx.storage.sql.exec('UPDATE metadata SET data=? WHERE id=1', JSON.stringify(metadata));
        await this.ctx.storage.deleteAlarm();
        return;
      }
      await this.ctx.storage.deleteAlarm();
      return;
    } catch {
      /* The completion acknowledgement is retried without reinitializing the game. */
    }
    await this.ctx.storage.setAlarm(Date.now() + (Date.now() < metadata.expiresAt ? 2000 : 30_000));
  }

  private async reconcileAccounts(force = false) {
    if (this.reconciled && !force && Date.now() < this.reconcileUntil) {
      return;
    }
    if (this.reconcilePromise) {
      return this.reconcilePromise;
    }
    const metadata = this.metadata!;
    const epoch = this.reconcileEpoch;
    const requestStartedAt = Date.now();
    this.nextReconcileAt = requestStartedAt + PLAY_AUTH_RENEWAL_MS;
    this.reconcilePromise = (async () => {
      let cursor = '';
      while (true) {
        const actors = this.ctx.storage.sql
          .exec<Actor>(
            'SELECT user_id, seat, display_name, deleted FROM actors WHERE deleted=0 AND user_id>? ORDER BY user_id LIMIT ?',
            cursor,
            PLAY_AUTHORIZATION_BATCH_SIZE
          )
          .toArray();
        if (!actors.length) {
          break;
        }
        const userIds = actors.map((actor) => actor.user_id);
        const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).query(
          makeFunctionReference<'query'>(PLAY_RECONCILE_ACCOUNTS_FUNCTION),
          {
            gameId: metadata.gameId,
            secret: metadata.secret,
            userIds,
          }
        );
        const result = playReconcileAccountsResultSchema.parse(raw);
        if (
          !result.ok ||
          result.accounts.length !== userIds.length ||
          new Set(result.accounts.map((account) => account.userId)).size !== userIds.length ||
          result.accounts.some((account) => !userIds.includes(account.userId))
        ) {
          throw new Error('Authorization unavailable.');
        }
        for (const account of result.accounts) {
          if (account.state !== 'active') {
            this.deleteActor(account.userId);
          }
        }
        cursor = actors.at(-1)!.user_id;
      }
      if (epoch === this.reconcileEpoch) {
        this.reconciled = true;
        this.reconcileUntil = requestStartedAt + PLAY_AUTH_LEASE_MS;
      }
    })();
    try {
      await this.reconcilePromise;
    } catch (error) {
      this.reconciled = false;
      this.reconcileUntil = 0;
      this.authorizationChanged();
      throw error;
    } finally {
      this.reconcilePromise = undefined;
    }
  }

  private deleteActor(userId: string, eventId?: string) {
    this.ctx.storage.transactionSync(() => {
      const actor = this.ctx.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
      if (actor && !actor.deleted) {
        this.ctx.storage.sql.exec(
          "UPDATE actors SET seat='neutral', display_name='[deleted user]', deleted=1 WHERE user_id=?",
          userId
        );
        this.ctx.storage.sql.exec(
          "UPDATE seat_history SET user_id=NULL, display_name='[deleted user]' WHERE user_id=?",
          userId
        );
        this.ctx.storage.sql.exec(
          "INSERT INTO seat_history(user_id,display_name,seat,event,created_at) VALUES(NULL,'[deleted user]',?,'vacated',?)",
          actor.seat,
          Date.now()
        );
        this.ctx.storage.sql.exec('DELETE FROM receipts WHERE actor_id=?', userId);
      }
      if (eventId) {
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO deletion_receipts VALUES(?)', eventId);
      }
    });
    for (const [socket, connection] of this.connections) {
      if (connection.viewer?.userId === userId) {
        this.deny(socket);
      }
    }
    this.broadcastActivity();
  }

  private viewerFor(connectionId: string, userId: string, displayName: string): Viewer {
    let actor = this.ctx.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
    if (actor?.deleted) {
      throw new Error('Admission refused.');
    }
    if (!actor) {
      const occupied = this.ctx.storage.sql
        .exec<Actor>("SELECT * FROM actors WHERE deleted=0 AND seat!='neutral'")
        .toArray();
      const seat =
        (['harkonnen', 'atreides'] as const).find((candidate) => !occupied.some((entry) => entry.seat === candidate)) ??
        'neutral';
      actor = { user_id: userId, seat, display_name: displayName.slice(0, 160), deleted: 0 };
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          'INSERT INTO actors VALUES(?,?,?,0)',
          actor!.user_id,
          actor!.seat,
          actor!.display_name
        );
        this.ctx.storage.sql.exec(
          "INSERT INTO seat_history(user_id,display_name,seat,event,created_at) VALUES(?,?,?,'joined',?)",
          actor!.user_id,
          actor!.display_name,
          actor!.seat,
          Date.now()
        );
      });
    }
    return {
      connectionId,
      userId,
      viewerSeat: actor.seat,
      displayName: actor.display_name,
      color: actor.seat === 'harkonnen' ? '#ed927c' : actor.seat === 'atreides' ? '#75d8a7' : '#d0c8b9',
    };
  }

  private async admit(socket: WebSocket, connection: Connection, ticket: string) {
    if (connection.admitting || connection.viewer) {
      this.deny(socket);
      return;
    }
    connection.admitting = true;
    try {
      const metadata = this.metadata!;
      const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
        makeFunctionReference<'mutation'>(PLAY_REDEEM_TICKET_FUNCTION),
        {
          gameId: metadata.gameId,
          secret: metadata.secret,
          ticket,
        }
      );
      const result = playRedeemTicketResultSchema.parse(raw);
      if (!result.ok || result.authExpiresAt <= Date.now()) {
        this.deny(socket);
        return;
      }
      await this.reconcileAccounts();
      if (
        !this.reconciled ||
        this.connections.get(socket) !== connection ||
        Date.now() >= connection.openedAt + PLAY_PENDING_TIMEOUT_MS
      ) {
        this.deny(socket);
        return;
      }
      const registrations = new Set(
        [...this.connections.values()].flatMap((entry) => (entry.registrationId ? [entry.registrationId] : []))
      );
      if (!registrations.has(result.registrationId) && registrations.size >= PLAY_AUTHORIZATION_BATCH_SIZE) {
        this.deny(socket);
        return;
      }
      connection.viewer = {
        connectionId: connection.connectionId,
        userId: result.userId,
        viewerSeat: 'neutral',
        displayName: result.displayName.slice(0, 160),
        color: '#d0c8b9',
      };
      connection.registrationId = result.registrationId;
      connection.sessionId = result.sessionId;
      this.authorization ??= new AuthorizationWatch(
        this.env.CONVEX_URL,
        { gameId: metadata.gameId, secret: metadata.secret },
        () => this.authorizationChanged()
      );
      this.authorization.add(result.registrationId, { userId: result.userId, sessionId: result.sessionId });
      this.authorizationChanged();
    } catch {
      this.deny(socket);
    }
  }

  private authorized(socket: WebSocket): boolean {
    const connection = this.connections.get(socket);
    return (
      !!connection?.viewer &&
      !!connection.registrationId &&
      this.reconciled &&
      Date.now() < this.reconcileUntil &&
      this.authorization?.status(connection.registrationId) === 'authorized'
    );
  }

  private authorizationChanged() {
    for (const [socket, connection] of this.connections) {
      if (!connection.registrationId) {
        continue;
      }
      const status = this.authorization?.status(connection.registrationId) ?? 'suspended';
      if (status === 'denied') {
        this.reconciled = false;
        this.reconcileEpoch++;
        this.deny(socket);
        void this.reconcileAccounts()
          .then(() => this.authorizationChanged())
          .catch(() => undefined);
      } else if (this.authorized(socket)) {
        if (connection.announced !== 'authorized') {
          try {
            connection.viewer = this.viewerFor(
              connection.connectionId,
              connection.viewer!.userId,
              connection.viewer!.displayName
            );
          } catch {
            this.deny(socket);
            continue;
          }
          connection.announced = 'authorized';
          connection.everAuthorized = true;
          this.sendView(socket, connection);
        }
      } else if (connection.announced !== 'suspended') {
        connection.announced = 'suspended';
        this.room?.disconnect(connection.connectionId);
        this.sendAdmission(socket, 'suspended');
      }
    }
  }

  override async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    const connection = this.connections.get(socket);
    if (!connection || typeof input !== 'string' || new TextEncoder().encode(input).byteLength > 8192) {
      this.deny(socket);
      return;
    }
    const now = Date.now();
    connection.tokens = Math.min(120, connection.tokens + (Math.max(0, now - connection.refilledAt) * 60) / 1000);
    connection.refilledAt = now;
    if (connection.tokens < 1) {
      this.disconnect(socket);
      socket.close(4413, 'Too many requests.');
      return;
    }
    connection.tokens--;
    let message: ClientMessage;
    try {
      message = clientMessageSchema.parse(JSON.parse(input));
    } catch {
      this.deny(socket);
      return;
    }
    if (message.type === 'admit') {
      await this.admit(socket, connection, message.ticket);
      return;
    }
    if (!this.authorized(socket)) {
      this.authorizationChanged();
      return;
    }
    const viewer = connection.viewer!;
    const room = this.room!;
    if (room.sweep()) {
      this.broadcastActivity();
    }
    const requestId =
      'commandId' in message
        ? message.commandId
        : 'requestId' in message
          ? message.requestId
          : 'carryId' in message
            ? message.carryId
            : 'message';
    try {
      if (message.type === 'history') {
        if (message.step > this.historyStep) {
          throw new Error('Unknown history step.');
        }
        this.send(socket, {
          type: 'history',
          step: message.step,
          lastStep: this.historyStep,
          snapshot: this.restoreHistory(message.step),
        });
      } else if (message.type === 'metrics') {
        this.send(socket, {
          type: 'metrics',
          revision: room.snapshot.revision,
          historySteps: this.historyStep,
          receiptCount: this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM receipts').one()
            .count,
          motionReceived: this.motionReceived,
          motionForwarded: this.motionForwarded,
          messagesSent: this.messagesSent,
          bytesSent: this.bytesSent,
        });
      } else if (message.type === 'pointer' || message.type === 'pose') {
        this.motionReceived++;
        if (message.type === 'pointer') {
          if (message.seq <= connection.pointerSeq) {
            return;
          }
          connection.pointerSeq = message.seq;
          room.pointer(viewer, message.position);
        } else if (!room.pose(viewer, message.carryId, message.seq, message.position, message.orientation)) {
          return;
        }
        this.motionForwarded++;
        this.broadcastActivity();
      } else if (message.type === 'begin' || message.type === 'take') {
        const draft =
          message.type === 'begin'
            ? room.begin(viewer, message.carryId, message.sourcePieceId, message.expectedVersion, message.pickup)
            : room.take(viewer, message.carryId, message.requestId, message.donorPieceId);
        this.send(socket, { type: 'carry', carryId: message.carryId, draft });
        this.broadcastActivity();
      } else if (message.type === 'renew' || message.type === 'cancel') {
        if (message.type === 'renew') {
          room.renew(viewer, message.carryId);
        } else {
          room.cancel(viewer, message.carryId);
        }
        this.broadcastActivity();
      } else {
        this.commit(socket, connection, message);
      }
    } catch (error) {
      if (message.type === 'drop' && room.carries.get(message.carryId)?.connectionId === connection.connectionId) {
        room.cancel(viewer, message.carryId);
        this.broadcastActivity();
      }
      this.send(socket, {
        type: 'rejected',
        requestId,
        message: error instanceof Error ? error.message : 'Unable to process the command.',
      });
    }
  }

  private commit(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'drop' | 'command' }>
  ) {
    if (!this.authorized(socket)) {
      return;
    }
    const viewer = connection.viewer!;
    const room = this.room!;
    const key = `${viewer.userId}:${message.commandId}`;
    const payload = JSON.stringify(message);
    const receipt = this.ctx.storage.sql
      .exec<{ payload: string }>('SELECT payload FROM receipts WHERE receipt_key=?', key)
      .toArray()[0];
    if (receipt) {
      if (receipt.payload !== payload) {
        throw new Error('That command ID was already used for different input.');
      }
      this.sendView(socket, connection, message.commandId);
      return;
    }
    const next = gameSnapshotSchema.parse(
      message.type === 'drop'
        ? room.drop(viewer, message.carryId, message.position, message.orientation)
        : room.command(viewer, message.action, message.expectedRevision)
    );
    const boundary = message.type === 'command' && ['phase', 'reset'].includes(message.action.kind);
    const checkpoint = message.type === 'command' && message.action.kind === 'reset';
    const historyData = boundary ? JSON.stringify(checkpoint ? next : diff(this.boundary!, next)) : undefined;
    const nextStep = this.historyStep + 1;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.ctx.storage.sql.exec('INSERT INTO receipts VALUES(?,?,?,?)', key, viewer.userId, payload, next.revision);
      if (historyData !== undefined) {
        this.ctx.storage.sql.exec(
          'INSERT INTO history VALUES(?,?,?,?,?,?,?)',
          nextStep,
          this.boundary!.revision,
          next.revision,
          next.phase,
          checkpoint ? 'checkpoint' : 'patch',
          historyData,
          new TextEncoder().encode(historyData).byteLength
        );
      }
    });
    room.accept(
      next,
      message.type === 'drop' ? message.carryId : undefined,
      message.type === 'command' && ['reset', 'enforcement', 'phase'].includes(message.action.kind)
    );
    if (historyData !== undefined) {
      this.historyStep = nextStep;
      this.boundary = next;
    }
    for (const [peer, identity] of this.connections) {
      this.sendView(peer, identity, identity.connectionId === connection.connectionId ? message.commandId : undefined);
    }
  }

  private restoreHistory(step: number): GameSnapshot {
    const checkpoint = this.ctx.storage.sql
      .exec<HistoryRow>("SELECT * FROM history WHERE kind='checkpoint' AND step<=? ORDER BY step DESC LIMIT 1", step)
      .one();
    let snapshot = gameSnapshotSchema.parse(JSON.parse(checkpoint.data));
    let restoredStep = checkpoint.step;
    for (const row of this.ctx.storage.sql.exec<HistoryRow>(
      'SELECT * FROM history WHERE step>? AND step<=? ORDER BY step',
      checkpoint.step,
      step
    )) {
      if (row.step !== restoredStep + 1 || row.base_revision !== snapshot.revision) {
        throw new Error('History is incomplete.');
      }
      snapshot = applyPatch(snapshot, JSON.parse(row.data) as Patch[]);
      if (snapshot.revision !== row.revision) {
        throw new Error('History is incomplete.');
      }
      restoredStep = row.step;
    }
    if (restoredStep !== step) {
      throw new Error('History is incomplete.');
    }
    return snapshot;
  }

  private send(socket: WebSocket, message: Exclude<ServerMessage, { type: 'admission' }>) {
    if (!this.authorized(socket) || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      const data = JSON.stringify(message);
      socket.send(data);
      this.messagesSent++;
      this.bytesSent += new TextEncoder().encode(data).byteLength;
    } catch {
      this.disconnect(socket);
    }
  }

  private sendAdmission(socket: WebSocket, status: 'suspended' | 'denied') {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'admission', status } satisfies ServerMessage));
      } catch {
        /* No game data accompanies a refusal. */
      }
    }
  }

  private sendView(socket: WebSocket, connection: Connection, completedCommandId?: string) {
    if (!connection.viewer || !this.room) {
      return;
    }
    this.send(socket, {
      type: 'view',
      viewer: connection.viewer,
      epoch: this.room.epoch,
      snapshot: this.room.snapshot,
      carries: this.room.publicCarries(),
      pointers: [...this.room.pointers.values()],
      ...(completedCommandId ? { completedCommandId } : {}),
    });
  }

  private broadcastActivity() {
    if (!this.room) {
      return;
    }
    const message: ServerMessage = {
      type: 'activity',
      epoch: this.room.epoch,
      carries: this.room.publicCarries(),
      pointers: [...this.room.pointers.values()],
    };
    for (const socket of this.connections.keys()) {
      this.send(socket, message);
    }
  }

  private deny(socket: WebSocket) {
    this.sendAdmission(socket, 'denied');
    this.disconnect(socket);
    socket.close(4401, 'Admission refused.');
  }

  private disconnect(socket: WebSocket) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    this.connections.delete(socket);
    this.room?.disconnect(connection.connectionId);
    if (
      connection.registrationId &&
      ![...this.connections.values()].some((entry) => entry.registrationId === connection.registrationId)
    ) {
      this.authorization?.remove(connection.registrationId);
    }
    if (!this.connections.size) {
      const authorization = this.authorization;
      this.authorization = undefined;
      if (authorization) {
        void authorization.close().catch(() => undefined);
      }
      if (this.sweepTimer) {
        clearInterval(this.sweepTimer);
      }
      this.sweepTimer = undefined;
      this.reconciled = false;
    }
    this.broadcastActivity();
  }

  private ensureSweep() {
    this.sweepTimer ??= setInterval(() => {
      for (const [socket, connection] of this.connections) {
        if (!connection.everAuthorized && Date.now() >= connection.openedAt + PLAY_PENDING_TIMEOUT_MS) {
          this.disconnect(socket);
          socket.close(4408, 'Admission timed out.');
        }
      }
      this.authorizationChanged();
      if (
        Date.now() >= this.nextReconcileAt &&
        [...this.connections.values()].some((connection) => connection.viewer)
      ) {
        void this.reconcileAccounts(true)
          .then(() => this.authorizationChanged())
          .catch(() => undefined);
      }
      if (this.room?.sweep()) {
        this.broadcastActivity();
      }
    }, 1000);
  }

  override webSocketClose(socket: WebSocket) {
    this.disconnect(socket);
    socket.close(1000, 'Connection closed.');
  }
  override webSocketError(socket: WebSocket) {
    this.disconnect(socket);
    socket.close(1011, 'Connection error.');
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== env.APPLICATION_ORIGIN || url.search) {
      return refused();
    }
    if (url.pathname === '/__play/health' && request.method === 'GET') {
      return json({
        ok: true,
        identity: {
          gitSha: env.GIT_SHA,
          workerVersionId: env.CF_VERSION_METADATA.id,
          workerVersionTag: env.CF_VERSION_METADATA.tag,
        },
      });
    }
    const match = /^\/__play\/games\/([a-zA-Z0-9_-]{1,128})\/(socket|provision|account-deletion)$/.exec(url.pathname);
    if (!match || (match[2] === 'socket' ? request.method !== 'GET' : request.method !== 'POST')) {
      return refused();
    }
    if (
      match[2] === 'socket' &&
      (request.headers.get('Origin') !== env.APPLICATION_ORIGIN ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    ) {
      return refused();
    }
    return env.GAME_ROOMS.getByName(match[1]).fetch(request);
  },
} satisfies ExportedHandler<GameEnv>;
