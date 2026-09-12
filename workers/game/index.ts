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
import { GameRejection } from '../../src/shared/play/rejection';
import { ActorDirectory } from './actors';
import { AuthorizationWatch, gameHttpClient } from './authorization';
import { GameDiagnostics } from './diagnostics';
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
  authorizationRound?: number;
  sessionId?: string;
  announced: 'pending' | 'authorized' | 'suspended';
  everAuthorized: boolean;
  pointerSeq: number;
  tokens: number;
  refilledAt: number;
};
type TicketAdmission = Extract<ReturnType<typeof playRedeemTicketResultSchema.parse>, { ok: true }>;
type HistoryRow = {
  step: number;
  base_revision: number;
  revision: number;
  phase: number;
  kind: string;
  data: string;
  bytes: number;
};
type CommitMessage = Extract<ClientMessage, { type: 'drop' | 'command' }>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refused = () => json({ error: 'Request refused.' }, 403);
function isApplicationSocket(request: Request, applicationOrigin: string): boolean {
  return (
    request.headers.get('Origin') === applicationOrigin && request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
  );
}
function gameRequest(request: Request, applicationOrigin: string) {
  const url = new URL(request.url);
  if (url.origin !== applicationOrigin || url.search) {
    return;
  }
  const match = /^\/__play\/games\/([a-zA-Z0-9_-]{1,128})\/(socket|provision|account-deletion)$/.exec(url.pathname);
  if (!match) {
    return;
  }
  const [, gameId, operation] = match;
  const method = operation === 'socket' ? 'GET' : 'POST';
  if (request.method !== method) {
    return;
  }
  return { gameId, operation };
}
function messageId(message: ClientMessage): string {
  if ('commandId' in message) {
    return message.commandId;
  }
  if ('requestId' in message) {
    return message.requestId;
  }
  if ('carryId' in message) {
    return message.carryId;
  }
  return 'message';
}
const credentialsMatch = (a: string, b: string) => {
  if (a.length !== 64 || b.length !== 64) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < 64; index++) {
    difference |= a.codePointAt(index)! ^ b.codePointAt(index)!;
  }
  return difference === 0;
};
async function readJson(request: Request): Promise<unknown> {
  if (!request.body || Number(request.headers.get('Content-Length') ?? 0) > 8192) {
    throw new Error('Request refused.');
  }
  return JSON.parse(await readLimitedBody(request.body)) as unknown;
}
async function readLimitedBody(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
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
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export class GameRoom extends DurableObject<GameEnv> {
  private readonly actors: ActorDirectory;
  private readonly diagnostics: GameDiagnostics;
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
    this.diagnostics = new GameDiagnostics(ctx.id.toString(), env.GIT_SHA);
    this.actors = new ActorDirectory(ctx.storage);
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
    const route = gameRequest(request, this.env.APPLICATION_ORIGIN);
    if (!route) {
      return refused();
    }
    const { gameId, operation } = route;
    if (operation === 'provision') {
      return this.provision(request, gameId);
    }
    if (this.metadata?.gameId !== gameId) {
      return refused();
    }
    if (operation === 'account-deletion') {
      return this.receiveAccountDeletion(request, this.metadata);
    }
    return this.openSocket(request);
  }

  private async provision(request: Request, gameId: string): Promise<Response> {
    let args: ReturnType<typeof playProvisionRequestSchema.parse>;
    try {
      args = playProvisionRequestSchema.parse(await readJson(request));
    } catch {
      return refused();
    }
    try {
      if (args.gameId !== gameId || this.metadata) {
        return refused();
      }
      const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
        makeFunctionReference<'mutation'>(PLAY_VALIDATE_PROVISIONING_FUNCTION),
        args
      );
      const validation = playProvisioningValidationSchema.parse(raw);
      if (!this.initializeValidated(args, validation)) {
        return refused();
      }
      await this.ctx.storage.setAlarm(Date.now() + 2000);
      await this.confirmProvisioning();
      return this.metadata!.confirmed ? json({ ok: true }) : refused();
    } catch (error) {
      this.diagnostics.report('provision', error);
      return refused();
    }
  }

  private initializeValidated(
    args: ReturnType<typeof playProvisionRequestSchema.parse>,
    validation: ReturnType<typeof playProvisioningValidationSchema.parse>
  ): boolean {
    // Another request can finish while Convex validates this one. Keep the guard and initialization synchronous.
    if (!validation.ok || this.metadata) {
      return false;
    }
    if (validation.gameId !== args.gameId || validation.attemptId !== args.attemptId) {
      return false;
    }
    if (validation.expiresAt <= Date.now()) {
      return false;
    }
    this.initialize({ ...args, expiresAt: validation.expiresAt, confirmed: false });
    return true;
  }

  private initialize(metadata: Metadata) {
    const snapshot = initialSnapshot();
    const data = JSON.stringify(snapshot);
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
  }

  private async receiveAccountDeletion(request: Request, metadata: Metadata): Promise<Response> {
    let args: ReturnType<typeof playAccountDeletionRequestSchema.parse>;
    try {
      args = playAccountDeletionRequestSchema.parse(await readJson(request));
    } catch {
      return refused();
    }
    try {
      if (args.gameId !== metadata.gameId || !credentialsMatch(args.secret, metadata.secret)) {
        return refused();
      }
      this.reconcileEpoch++;
      this.deleteActor(args.userId, args.eventId);
      const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
        makeFunctionReference<'mutation'>(PLAY_ACK_ACCOUNT_DELETION_FUNCTION),
        {
          gameId: metadata.gameId,
          secret: metadata.secret,
          eventId: args.eventId,
        }
      );
      return raw === null ? json({ ok: true }) : refused();
    } catch (error) {
      this.diagnostics.report('account-deletion', error);
      return refused();
    }
  }

  private openSocket(request: Request): Response {
    if (!this.metadata!.confirmed || !isApplicationSocket(request, this.env.APPLICATION_ORIGIN)) {
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
    } catch (error) {
      this.diagnostics.report('confirmation', error);
      /* The completion acknowledgement is retried without reinitializing the game. */
    }
    await this.ctx.storage.setAlarm(Date.now() + (Date.now() < metadata.expiresAt ? 2000 : 30_000));
  }

  private async reconcileAccounts(force = false) {
    if (this.hasAccountLease() && !force) {
      return;
    }
    if (this.reconcilePromise) {
      return this.reconcilePromise;
    }
    const metadata = this.metadata!;
    const epoch = this.reconcileEpoch;
    const requestStartedAt = Date.now();
    this.nextReconcileAt = requestStartedAt + PLAY_AUTH_RENEWAL_MS;
    this.reconcilePromise = this.reconcileDirectory(metadata, epoch, requestStartedAt);
    try {
      await this.reconcilePromise;
    } catch (error) {
      this.diagnostics.report('account-reconciliation', error);
      this.reconciled = false;
      this.reconcileUntil = 0;
      this.authorizationChanged();
      throw error;
    } finally {
      this.reconcilePromise = undefined;
    }
  }

  private hasAccountLease() {
    return this.reconciled && Date.now() < this.reconcileUntil;
  }

  private async reconcileDirectory(metadata: Metadata, epoch: number, requestStartedAt: number) {
    let cursor = '';
    while (true) {
      const actors = this.actors.batch(cursor);
      if (!actors.length) {
        break;
      }
      const accounts = await this.accountBatch(
        metadata,
        actors.map((actor) => actor.user_id)
      );
      this.applyAccountReconciliation(accounts);
      cursor = actors.at(-1)!.user_id;
    }
    if (epoch === this.reconcileEpoch) {
      this.reconciled = true;
      this.reconcileUntil = requestStartedAt + PLAY_AUTH_LEASE_MS;
    }
  }

  private applyAccountReconciliation(
    accounts: Extract<ReturnType<typeof playReconcileAccountsResultSchema.parse>, { ok: true }>['accounts']
  ) {
    for (const account of accounts) {
      if (account.state !== 'active') {
        this.deleteActor(account.userId);
      }
    }
  }

  private async accountBatch(metadata: Metadata, userIds: string[]) {
    const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).query(
      makeFunctionReference<'query'>(PLAY_RECONCILE_ACCOUNTS_FUNCTION),
      { gameId: metadata.gameId, secret: metadata.secret, userIds }
    );
    const result = playReconcileAccountsResultSchema.parse(raw);
    if (!result.ok || result.accounts.length !== userIds.length) {
      throw new Error('Authorization unavailable.');
    }
    const remaining = new Set(userIds);
    if (!result.accounts.every((account) => remaining.delete(account.userId))) {
      throw new Error('Authorization unavailable.');
    }
    return result.accounts;
  }

  private deleteActor(userId: string, eventId?: string) {
    this.actors.delete(userId, eventId);
    for (const [socket, connection] of this.connections) {
      if (connection.viewer?.userId === userId) {
        this.deny(socket);
      }
    }
    this.broadcastActivity();
  }

  private async redeemAdmission(ticket: string): Promise<TicketAdmission> {
    const metadata = this.metadata!;
    const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
      makeFunctionReference<'mutation'>(PLAY_REDEEM_TICKET_FUNCTION),
      { gameId: metadata.gameId, secret: metadata.secret, ticket }
    );
    const result = playRedeemTicketResultSchema.parse(raw);
    if (!result.ok || result.authExpiresAt <= Date.now()) {
      throw new GameRejection('Admission refused.');
    }
    return result;
  }

  private pendingConnection(socket: WebSocket, connection: Connection) {
    return this.connections.get(socket) === connection && Date.now() < connection.openedAt + PLAY_PENDING_TIMEOUT_MS;
  }

  private registeredSessions() {
    return new Set(
      [...this.connections.values()].flatMap((entry) => (entry.registrationId ? [entry.registrationId] : []))
    );
  }

  private canRegister(registrationId: string) {
    const registrations = this.registeredSessions();
    return registrations.has(registrationId) || registrations.size < PLAY_AUTHORIZATION_BATCH_SIZE;
  }

  private registerConnection(connection: Connection, result: TicketAdmission) {
    connection.viewer = {
      connectionId: connection.connectionId,
      userId: result.userId,
      viewerSeat: 'neutral',
      displayName: result.displayName.slice(0, 160),
      color: '#d0c8b9',
    };
    connection.registrationId = result.registrationId;
    connection.sessionId = result.sessionId;
    const metadata = this.metadata!;
    this.authorization ??= new AuthorizationWatch(
      this.env.CONVEX_URL,
      { gameId: metadata.gameId, secret: metadata.secret },
      () => this.authorizationChanged(),
      this.diagnostics
    );
    connection.authorizationRound = this.authorization.add(result.registrationId, {
      userId: result.userId,
      sessionId: result.sessionId,
    });
  }

  private async admit(socket: WebSocket, connection: Connection, ticket: string) {
    if (connection.admitting || connection.viewer) {
      this.deny(socket);
      return;
    }
    connection.admitting = true;
    try {
      const result = await this.redeemAdmission(ticket);
      await this.reconcileAccounts();
      if (!this.reconciled || !this.pendingConnection(socket, connection)) {
        this.deny(socket);
        return;
      }
      if (!this.canRegister(result.registrationId)) {
        this.deny(socket);
        return;
      }
      this.registerConnection(connection, result);
      this.authorizationChanged();
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        this.diagnostics.report('admission', error);
      }
      this.deny(socket);
    }
  }

  private authorized(socket: WebSocket): boolean {
    const connection = this.connections.get(socket);
    if (!connection?.viewer || !connection.registrationId) {
      return false;
    }
    if (connection.authorizationRound === undefined || !this.hasAccountLease()) {
      return false;
    }
    return (
      this.authorization?.status(connection.registrationId, { minimumRound: connection.authorizationRound }) ===
      'authorized'
    );
  }

  private authorizationChanged() {
    for (const [socket, connection] of this.connections) {
      this.updateConnectionAuthorization(socket, connection);
    }
  }

  private updateConnectionAuthorization(socket: WebSocket, connection: Connection) {
    if (!connection.registrationId) {
      return;
    }
    const status = this.authorization?.status(connection.registrationId) ?? 'suspended';
    if (status === 'denied') {
      this.reconciled = false;
      this.reconcileEpoch++;
      this.deny(socket);
      this.refreshAccounts();
    } else if (this.authorized(socket)) {
      this.announceAuthorized(socket, connection);
    } else if (connection.announced !== 'suspended') {
      connection.announced = 'suspended';
      this.room?.clearActivity(connection.connectionId);
      this.sendAdmission(socket, 'suspended');
    }
  }

  private announceAuthorized(socket: WebSocket, connection: Connection) {
    if (connection.announced === 'authorized') {
      return;
    }
    try {
      connection.viewer = this.actors.viewer(
        connection.connectionId,
        connection.viewer!.userId,
        connection.viewer!.displayName
      );
    } catch {
      this.deny(socket);
      return;
    }
    connection.announced = 'authorized';
    connection.everAuthorized = true;
    this.sendView(socket, connection);
  }

  private refreshAccounts(force = false) {
    void this.reconcileAccounts(force)
      .then(() => this.authorizationChanged())
      .catch(() => undefined);
  }

  override async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    const message = this.readMessage(socket, connection, input);
    if (!message) {
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
    if (this.room!.sweep()) {
      this.broadcastActivity();
    }
    try {
      this.dispatch(socket, connection, message);
    } catch (error) {
      this.rejectMessage(socket, connection, message, error);
    }
  }

  private readMessage(
    socket: WebSocket,
    connection: Connection,
    input: string | ArrayBuffer
  ): ClientMessage | undefined {
    if (typeof input !== 'string' || input.length > 8192) {
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
    try {
      return clientMessageSchema.parse(JSON.parse(input));
    } catch {
      this.deny(socket);
      return;
    }
  }

  private dispatch(socket: WebSocket, connection: Connection, message: Exclude<ClientMessage, { type: 'admit' }>) {
    switch (message.type) {
      case 'history':
        this.sendHistory(socket, message.step);
        return;
      case 'metrics':
        this.sendMetrics(socket);
        return;
      case 'command':
      case 'drop':
        this.commit(socket, connection, message);
        return;
      default:
        this.publishActivity(socket, connection, message);
    }
  }

  private sendHistory(socket: WebSocket, step: number) {
    if (step > this.historyStep) {
      throw new GameRejection('Unknown history step.');
    }
    this.send(socket, { type: 'history', step, lastStep: this.historyStep, snapshot: this.restoreHistory(step) });
  }

  private sendMetrics(socket: WebSocket) {
    this.send(socket, {
      type: 'metrics',
      revision: this.room!.snapshot.revision,
      historySteps: this.historyStep,
      receiptCount: this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM receipts').one().count,
      motionReceived: this.motionReceived,
      motionForwarded: this.motionForwarded,
      messagesSent: this.messagesSent,
      bytesSent: this.bytesSent,
    });
  }

  private publishActivity(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'pointer' | 'pose' | 'begin' | 'take' | 'renew' | 'cancel' }>
  ) {
    const room = this.room!;
    const viewer = connection.viewer!;
    switch (message.type) {
      case 'pointer':
      case 'pose':
        this.moveActivity(connection, message);
        return;
      case 'begin': {
        const draft = room.begin(viewer, message);
        this.send(socket, { type: 'carry', carryId: message.carryId, draft });
        break;
      }
      case 'take': {
        const draft = room.take(viewer, message);
        this.send(socket, { type: 'carry', carryId: message.carryId, draft });
        break;
      }
      case 'renew':
        room.renew(viewer, message.carryId);
        break;
      case 'cancel':
        room.cancel(viewer, message.carryId);
        break;
    }
    this.broadcastActivity();
  }

  private moveActivity(connection: Connection, message: Extract<ClientMessage, { type: 'pointer' | 'pose' }>) {
    this.motionReceived++;
    const room = this.room!;
    const viewer = connection.viewer!;
    if (message.type === 'pointer') {
      if (message.seq <= connection.pointerSeq) {
        return;
      }
      connection.pointerSeq = message.seq;
      room.pointer(viewer, message.position);
    } else if (!room.pose(viewer, message)) {
      return;
    }
    this.motionForwarded++;
    this.broadcastActivity();
  }

  private rejectMessage(socket: WebSocket, connection: Connection, message: ClientMessage, error: unknown) {
    if (!(error instanceof GameRejection)) {
      this.diagnostics.report('message', error);
    }
    if (message.type === 'drop' && this.room!.carries.get(message.carryId)?.connectionId === connection.connectionId) {
      this.room!.cancel(connection.viewer!, message.carryId);
      this.broadcastActivity();
    }
    this.send(socket, {
      type: 'rejected',
      requestId: messageId(message),
      message: error instanceof GameRejection ? error.message : 'Unable to process the command.',
    });
  }

  private commit(socket: WebSocket, connection: Connection, message: CommitMessage) {
    if (!this.authorized(socket)) {
      return;
    }
    const viewer = connection.viewer!;
    const room = this.room!;
    const key = `${viewer.userId}:${message.commandId}`;
    if (this.alreadyCommitted(key, message)) {
      this.sendView(socket, connection, message.commandId);
      return;
    }
    const next = gameSnapshotSchema.parse(
      message.type === 'drop'
        ? room.drop(viewer, message.carryId, message.position, message.orientation)
        : room.command(viewer, message.action, message.expectedRevision)
    );
    const history = this.historyEntry(message, next);
    this.persistCommit({ key, viewer, message, next, history });
    room.accept(
      next,
      message.type === 'drop' ? message.carryId : undefined,
      message.type === 'command' && ['reset', 'enforcement'].includes(message.action.kind)
    );
    if (history) {
      this.historyStep = history.step;
      this.boundary = next;
    }
    this.broadcastCommittedView(connection, message);
  }

  private alreadyCommitted(key: string, message: CommitMessage): boolean {
    const receipt = this.ctx.storage.sql
      .exec<{ payload: string }>('SELECT payload FROM receipts WHERE receipt_key=?', key)
      .toArray()[0];
    if (!receipt) {
      return false;
    }
    if (receipt.payload !== JSON.stringify(message)) {
      throw new GameRejection('That command ID was already used for different input.');
    }
    return true;
  }

  private historyEntry(message: CommitMessage, next: GameSnapshot): HistoryRow | undefined {
    if (message.type !== 'command' || !['phase', 'turn', 'reset'].includes(message.action.kind)) {
      return;
    }
    const checkpoint = message.action.kind === 'reset';
    const data = JSON.stringify(checkpoint ? next : diff(this.boundary!, next));
    return {
      step: this.historyStep + 1,
      base_revision: this.boundary!.revision,
      revision: next.revision,
      phase: next.phase,
      kind: checkpoint ? 'checkpoint' : 'patch',
      data,
      bytes: new TextEncoder().encode(data).byteLength,
    };
  }

  private persistCommit(commit: {
    key: string;
    viewer: Viewer;
    message: CommitMessage;
    next: GameSnapshot;
    history?: HistoryRow;
  }) {
    const { key, viewer, message, next, history } = commit;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.ctx.storage.sql.exec(
        'INSERT INTO receipts VALUES(?,?,?,?)',
        key,
        viewer.userId,
        JSON.stringify(message),
        next.revision
      );
      if (history) {
        this.ctx.storage.sql.exec(
          'INSERT INTO history VALUES(?,?,?,?,?,?,?)',
          history.step,
          history.base_revision,
          history.revision,
          history.phase,
          history.kind,
          history.data,
          history.bytes
        );
      }
    });
  }

  private broadcastCommittedView(connection: Connection, message: CommitMessage) {
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
      snapshot = this.restorePatch(snapshot, row);
      restoredStep = row.step;
    }
    if (restoredStep !== step) {
      throw new Error('History is incomplete.');
    }
    return snapshot;
  }

  private restorePatch(snapshot: GameSnapshot, row: HistoryRow): GameSnapshot {
    const next = applyPatch(snapshot, JSON.parse(row.data) as Patch[]);
    if (next.revision !== row.revision) {
      throw new Error('History is incomplete.');
    }
    return next;
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
    } catch (error) {
      this.diagnostics.report('socket-send', error);
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
    if (connection.registrationId && !this.registeredSessions().has(connection.registrationId)) {
      this.authorization?.remove(connection.registrationId);
    }
    if (!this.connections.size) {
      this.closeAuthorization();
    }
    this.broadcastActivity();
  }

  private closeAuthorization() {
    const authorization = this.authorization;
    this.authorization = undefined;
    if (authorization) {
      void authorization.close().catch((error) => this.diagnostics.report('authorization-close', error));
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    this.sweepTimer = undefined;
    this.reconciled = false;
  }

  private ensureSweep() {
    this.sweepTimer ??= setInterval(() => this.sweepConnections(), 1000);
  }

  private expirePendingConnections() {
    for (const [socket, connection] of this.connections) {
      if (!connection.everAuthorized && Date.now() >= connection.openedAt + PLAY_PENDING_TIMEOUT_MS) {
        this.disconnect(socket);
        socket.close(4408, 'Admission timed out.');
      }
    }
  }

  private sweepConnections() {
    this.expirePendingConnections();
    this.authorizationChanged();
    const hasViewers = [...this.connections.values()].some((connection) => connection.viewer);
    if (Date.now() >= this.nextReconcileAt && hasViewers) {
      this.refreshAccounts(true);
    }
    if (this.room?.sweep()) {
      this.broadcastActivity();
    }
  }

  override webSocketClose(socket: WebSocket) {
    this.disconnect(socket);
    socket.close(1000, 'Connection closed.');
  }
  override webSocketError(socket: WebSocket, error: unknown) {
    this.diagnostics.report('socket-error', error);
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
    const route = gameRequest(request, env.APPLICATION_ORIGIN);
    if (!route) {
      return refused();
    }
    if (route.operation === 'socket' && !isApplicationSocket(request, env.APPLICATION_ORIGIN)) {
      return refused();
    }
    return env.GAME_ROOMS.getByName(route.gameId).fetch(request);
  },
} satisfies ExportedHandler<GameEnv>;
