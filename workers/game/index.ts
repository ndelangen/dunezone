import { DurableObject } from 'cloudflare:workers';
import { makeFunctionReference } from 'convex/server';

import {
  PLAY_ACK_ACCOUNT_DELETION_FUNCTION,
  PLAY_AUTH_LEASE_MS,
  PLAY_AUTH_RECOVERY_MS,
  PLAY_AUTH_RENEWAL_MS,
  PLAY_AUTHORIZATION_BATCH_SIZE,
  PLAY_CONFIRM_PROVISIONING_FUNCTION,
  PLAY_CONFIRMATION_RECOVERY_MS,
  PLAY_CONFIRMATION_RETRY_MS,
  PLAY_FAIL_PROVISIONING_FUNCTION,
  PLAY_PENDING_TIMEOUT_MS,
  PLAY_RECONCILE_ACCOUNTS_FUNCTION,
  PLAY_REDEEM_TICKET_FUNCTION,
  PLAY_VALIDATE_PROVISIONING_FUNCTION,
  playAccountDeletionRequestSchema,
  playConfirmationSchema,
  playProvisioningValidationSchema,
  playProvisionRequestSchema,
  playReconcileAccountsResultSchema,
  playRedeemTicketResultSchema,
} from '../../src/shared/play/admission';
import type { ExtraReference } from '../../src/shared/play/capture';
import {
  PLAY_DIRECTORY_RETRY_CEILING_MS,
  PLAY_DIRECTORY_RETRY_MS,
  PLAY_PUBLISH_SUMMARY_FUNCTION,
  playPublishSummaryResultSchema,
} from '../../src/shared/play/directory';
import type { DraftFaction } from '../../src/shared/play/drafting';
import { isDraftAction } from '../../src/shared/play/drafting';
import type { SpawnContents } from '../../src/shared/play/inventory';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import type { ClientMessage, ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { clientMessageSchema } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { SPECTATOR_COLOR } from './actors';
import { AuthorizationWatch, gameHttpClient } from './authorization';
import { GameCatalogue } from './catalogue';
import { RoomDelivery } from './delivery';
import { GameDiagnostics } from './diagnostics';
import { FIXTURE_TREACHERY_DECK } from './fixture';
import type { Metadata } from './session';
import { GameSession } from './session';

/** The seat a real game's creator holds from creation. */

type Connection = {
  connectionId: string;
  openedAt: number;
  admitting: boolean;
  /* One catalogue capture per connection at a time; a capture is up to hundreds of sequential Convex queries. */
  capturing: boolean;
  conversations?: boolean;
  viewer?: Viewer;
  /* The player's public avatar as their admission carried it; the actor directory keeps it. */
  avatarUrl?: string | null;
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
/*
 * A tab still running the bundle from before #1311 requires `enforcement` on every full snapshot (view and history frames) and `warning` on every carried draft, and turns a frame without them into a refresh prompt.
 * This Worker deploys before that bundle is replaced, so a refresh in between reloads the same bundle.
 * #1326 deletes this in a later release.
 */
function withPreviousBundleFields(message: Exclude<ServerMessage, { type: 'admission' }>) {
  switch (message.type) {
    case 'view':
    case 'history':
      return {
        ...message,
        snapshot: { ...message.snapshot, table: { ...message.snapshot.table, enforcement: 'sandbox' } },
      };
    case 'carry':
      return { ...message, draft: { ...message.draft, warning: null } };
    default:
      return message;
  }
}

export class GameRoom extends DurableObject<GameEnv> {
  private assigning = false;
  private draftChangedDuringAttempt = false;
  private refreshingCatalogue = false;
  private directoryDelivery?: Promise<void>;
  protected readonly diagnostics: GameDiagnostics;
  private confirmationEpoch = 0;
  private readonly connections = new Map<WebSocket, Connection>();
  private authorization: AuthorizationWatch | undefined;
  private readonly delivery = new RoomDelivery();
  private activityTimer: ReturnType<typeof setTimeout> | undefined;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private reconcilePromise: Promise<void> | undefined;
  private reconciled = false;
  private reconcileUntil = 0;
  private nextReconcileAt = 0;
  private reconcileFailures = 0;
  private reconcileEpoch = 0;
  private motionReceived = 0;
  private motionForwarded = 0;
  private activityDeliveries = 0;
  private messagesSent = 0;
  private bytesSent = 0;
  private readonly session: GameSession;
  private get metadata() {
    return this.session.info;
  }
  constructor(ctx: DurableObjectState, env: GameEnv) {
    super(ctx, env);
    this.diagnostics = new GameDiagnostics(ctx.id.toString(), env.GIT_SHA);
    this.session = new GameSession(ctx.storage);
    if (this.metadata) {
      if (this.metadata.confirmed && this.session.pendingDirectory()) {
        this.deliverDirectorySoon();
      }
      if (this.session.needsFixtureDeck) {
        this.ctx.waitUntil(this.adoptFixtureDeck().catch((error) => this.diagnostics.report('fixture-deck', error)));
      }
      this.afterDraftChange();
    }
    for (const socket of ctx.getWebSockets()) {
      socket.close(1012, 'Reconnect to the table.');
    }
  }

  /*
   * The hosted fixture deals a real treachery deck from the catalogue when the catalogue can supply
   * it, through the same capture the shared inventory spawns from. A catalogue that cannot (the
   * native peer, a backend without the deck) leaves the fixture's placeholder cards in place.
   */
  private async captureFixtureDeck(): Promise<SpawnContents | undefined> {
    try {
      const deck = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).capture(
        FIXTURE_TREACHERY_DECK
      );
      /* The deal reads the pieces only; the definitions the inventory audits would bloat every metadata write. */
      return { ...deck, definitions: [] };
    } catch (error) {
      /* A catalogue without the deck is the expected refusal; only a broken read is worth a report. */
      if (!(error instanceof GameRejection)) {
        this.diagnostics.report('fixture-deck', error);
      }
      return undefined;
    }
  }
  private async adoptFixtureDeck() {
    const deck = await this.captureFixtureDeck();
    if (deck) {
      this.session.adoptFixtureDeck(deck);
    }
  }

  /*
   * The catalogue captures a game retains: the ruleset once at creation, each faction once at
   * public assignment.
   * A record already retained is read back without touching the catalogue, so a retry, a source
   * edit or a deletion changes nothing.
   * Creation and assignment call these when they land; until then only the isolated test fixture does.
   */
  protected async retainRulesetCapture(rulesetId: string, options: { provisional?: boolean } = {}) {
    const existing = this.session.retainedRuleset(rulesetId);
    if (existing) {
      return existing;
    }
    const capture = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).captureRuleset(rulesetId);
    return this.session.retainRuleset(capture, options);
  }

  protected async retainFactionCapture(
    factionId: string,
    extras: readonly ExtraReference[] = [],
    options: { provisional?: boolean } = {}
  ) {
    const existing = this.session.retainedFaction(factionId);
    if (existing) {
      return existing;
    }
    const capture = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).captureFaction(
      factionId,
      extras
    );
    return this.session.retainFaction(capture, options);
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
      /* A real game retains its ruleset before it exists; a ruleset that is not ready never becomes a game. */
      if (validation.ok && 'game' in validation && !this.metadata) {
        try {
          await this.retainRulesetCapture(validation.game.rulesetId, { provisional: validation.provisional === true });
        } catch (error) {
          if (!(error instanceof GameRejection)) {
            throw error;
          }
          if (!this.metadata) {
            await gameHttpClient(this.env.CONVEX_URL).mutation(
              makeFunctionReference<'mutation'>(PLAY_FAIL_PROVISIONING_FUNCTION),
              { ...args, reason: error.message }
            );
          }
          return refused();
        }
      }
      const factions =
        validation.ok && 'game' in validation && !this.metadata
          ? await this.draftableFactions(validation.game.rulesetId)
          : null;
      /* The hosted fixture asks the catalogue for its deck before it exists; a refusal costs nothing, a slow answer only time. */
      const fixtureDeck =
        validation.ok && 'fixtureKey' in validation && !validation.loadProfile && !this.metadata
          ? await this.captureFixtureDeck()
          : undefined;
      if (!this.initializeValidated(args, validation, factions, fixtureDeck)) {
        return refused();
      }
      await this.confirmProvisioning();
      return this.metadata!.confirmed ? json({ ok: true }) : refused();
    } catch (error) {
      this.diagnostics.report('provision', error);
      return refused();
    }
  }

  private initializeValidated(
    args: ReturnType<typeof playProvisionRequestSchema.parse>,
    validation: ReturnType<typeof playProvisioningValidationSchema.parse>,
    factions: DraftFaction[] | null,
    fixtureDeck?: SpawnContents
  ): boolean {
    // Another request can finish while Convex validates this one and the ruleset is captured. Keep the guard and initialization synchronous.
    if (!validation.ok || this.metadata) {
      return false;
    }
    if (validation.gameId !== args.gameId || validation.attemptId !== args.attemptId) {
      return false;
    }
    if (validation.expiresAt <= Date.now()) {
      return false;
    }
    this.session.initialize(
      {
        ...args,
        expiresAt: validation.expiresAt,
        confirmed: false,
        ...('loadProfile' in validation && validation.loadProfile ? { loadProfile: validation.loadProfile } : {}),
        ...('game' in validation ? { game: validation.game } : {}),
        ...('provisional' in validation && validation.provisional ? { provisional: true } : {}),
        ...(fixtureDeck ? { fixtureDeck } : {}),
      },
      factions
    );
    /* A catalogue read that failed at creation is read again at once rather than on the first command. */
    this.afterDraftChange();
    return true;
  }

  protected retainedCaptures() {
    return this.session.retainedCaptures();
  }
  private broadcastViews() {
    for (const [socket, connection] of this.connections) {
      this.sendView(socket, connection);
    }
  }
  private advanceDeadlines() {
    if (this.session.advanceDeadlines()) {
      this.deliverDirectorySoon();
      this.reconcileViewers();
      this.broadcastViews();
    }
  }
  private deleteActor(userId: string, eventId?: string) {
    this.session.deleteActor(userId, eventId);
    this.deliverDirectorySoon();
    for (const [socket, connection] of this.connections) {
      if (connection.viewer?.userId === userId) {
        this.deny(socket, false);
      }
    }
    this.reconcileViewers();
    this.broadcastViews();
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
      capturing: false,
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
    if (this.metadata?.confirmed) {
      this.advanceDeadlines();
      await this.deliverDirectory();
    } else {
      await this.confirmProvisioning();
    }
  }

  /** One alarm serves the battle deadline and the directory retry: whichever is due first. */
  private scheduleAlarm() {
    const deadline = this.session.nextDeadline();
    return deadline === undefined ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(deadline);
  }

  /** Delivery starts after the current transaction has committed, never from inside it. */
  private deliverDirectorySoon() {
    this.ctx.waitUntil(
      Promise.resolve()
        .then(() => this.deliverDirectory())
        .catch((error) => this.diagnostics.report('directory', error))
    );
  }

  /*
   * Sends the pending summary until Convex holds the newest one. An acknowledgment clears only the
   * sequence it names, so newer work staged meanwhile stays owed; a transport failure defers with
   * backoff and the alarm retries it with no player connected; a refusal is terminal, since no
   * retry cures a wrong credential or a game Convex no longer lists. The loop stays single-flight
   * because its only awaits are the delivery and a storage call: a stage that lands between the
   * last `pending()` read and the loop's end would otherwise wait for the next event.
   */
  private deliverDirectory(): Promise<void> {
    this.directoryDelivery ??= this.deliverDirectoryLoop().finally(() => {
      this.directoryDelivery = undefined;
    });
    return this.directoryDelivery;
  }

  private async deliverDirectoryLoop() {
    const metadata = this.metadata;
    /* Until confirmation settles, its recovery owns the alarm and the opening summary stays queued. */
    if (!metadata?.confirmed) {
      return;
    }
    for (let pending = this.session.pendingDirectory(); pending; pending = this.session.pendingDirectory()) {
      const now = Date.now();
      if (pending.retryAt > now) {
        break;
      }
      try {
        const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
          makeFunctionReference<'mutation'>(PLAY_PUBLISH_SUMMARY_FUNCTION),
          { gameId: metadata.gameId, secret: metadata.secret, sequence: pending.sequence, summary: pending.summary }
        );
        const result = playPublishSummaryResultSchema.parse(raw);
        if (!result.ok) {
          this.session.acknowledgeDirectory(pending.sequence);
          this.diagnostics.report('directory', new Error('Directory delivery refused.'));
        } else if (result.sequence > pending.sequence) {
          this.session.advanceDirectory(result.sequence);
        } else {
          this.session.acknowledgeDirectory(pending.sequence);
        }
      } catch (error) {
        this.diagnostics.report('directory', error);
        const wait = Math.min(PLAY_DIRECTORY_RETRY_CEILING_MS, PLAY_DIRECTORY_RETRY_MS * 2 ** pending.attempts);
        this.session.deferDirectory(pending.sequence, Date.now() + wait);
        break;
      }
    }
    await this.scheduleAlarm();
  }

  private async confirmProvisioning() {
    const metadata = this.metadata;
    if (!metadata || metadata.confirmed) {
      return;
    }
    const epoch = ++this.confirmationEpoch;
    const startedAt = Date.now();
    /* Recovery stays durable while the request is pending, including when it crosses expiry. */
    await this.ctx.storage.setAlarm(
      startedAt + (startedAt < metadata.expiresAt ? PLAY_CONFIRMATION_RETRY_MS : PLAY_CONFIRMATION_RECOVERY_MS)
    );
    try {
      const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(
        makeFunctionReference<'mutation'>(PLAY_CONFIRM_PROVISIONING_FUNCTION),
        {
          gameId: metadata.gameId,
          secret: metadata.secret,
          attemptId: metadata.attemptId,
        }
      );
      if (epoch !== this.confirmationEpoch) {
        return;
      }
      if (playConfirmationSchema.parse(raw).ok) {
        this.session.confirm();
      }
      await this.ctx.storage.deleteAlarm();
      /* The opening summary waited for confirmation: only a confirmed game is listed. */
      this.deliverDirectorySoon();
    } catch (error) {
      /* A superseded attempt still reports, so a first request that outlives its alarm stays visible. */
      this.diagnostics.report('confirmation', error);
      /* The pre-armed alarm retries the acknowledgement without reinitializing the game. */
    }
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
      this.reconcileFailures = 0;
      if (epoch !== this.reconcileEpoch) {
        /* A denial landed while this pass ran; the next sweep reconciles again instead of waiting a cadence. */
        this.nextReconcileAt = Date.now();
      }
    } catch (error) {
      this.diagnostics.report('account-reconciliation', error);
      this.reconciled = false;
      this.reconcileUntil = 0;
      /* A failed reconciliation retries with backoff; the renewal cadence is too slow to be the recovery path. */
      this.nextReconcileAt =
        Date.now() + Math.min(PLAY_AUTH_RENEWAL_MS, PLAY_AUTH_RECOVERY_MS * 2 ** this.reconcileFailures);
      this.reconcileFailures++;
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
      const actors = this.session.actorBatch(cursor);
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
      viewerSeat: SPECTATOR_SEAT,
      displayName: result.displayName.slice(0, 160),
      color: SPECTATOR_COLOR,
    };
    /* Absent means the directory did not say; null means no picture. Only an answer updates the stored one. */
    connection.avatarUrl = result.avatarUrl;
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
    const allowed =
      this.authorization?.status(connection.registrationId, { minimumRound: connection.authorizationRound }) ===
      'authorized';
    if (allowed && connection.everAuthorized) {
      const seat = this.session.seatFor(connection.viewer.userId);
      if (!seat) {
        return false;
      }
      if (seat !== connection.viewer.viewerSeat) {
        return false;
      }
    }
    return allowed;
  }

  /** Settles seat changes and released carries before any connection receives the resulting state. */
  private reconcileViewers() {
    if (!this.session.ready) {
      return false;
    }
    const revision = this.session.revision;
    for (const connection of this.connections.values()) {
      if (connection.viewer && connection.everAuthorized) {
        const viewer = this.session.refreshViewer(connection.viewer);
        if (viewer) {
          connection.viewer = viewer;
        }
      }
    }
    return this.session.revision !== revision;
  }

  private authorizationChanged() {
    const revision = this.session.revision;
    this.reconcileViewers();
    const admitted = new Set<WebSocket>();
    let activityChanged = false;
    for (const [socket, connection] of this.connections) {
      const change = this.updateConnectionAuthorization(socket, connection);
      if (change === 'admitted') {
        admitted.add(socket);
      }
      activityChanged ||= change === 'activity';
    }
    this.reconcileViewers();
    if (admitted.size) {
      for (const [socket, connection] of this.connections) {
        if (!connection.viewer || !this.authorized(socket)) {
          continue;
        }
        if (admitted.has(socket)) {
          /* A resumed connection leaves suspension only after receiving a full view. */
          this.sendView(socket, connection);
        } else {
          this.send(
            socket,
            this.delivery.update(socket, connection.viewer, this.session.roomFrame(connection.viewer), {
              committed: true,
            })
          );
        }
      }
    } else if (activityChanged || this.session.revision !== revision) {
      this.broadcastActivity(this.session.revision !== revision);
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
      this.deny(socket, false);
      this.refreshAccounts();
      return 'activity';
    }
    if (this.authorized(socket)) {
      if (connection.announced === 'authorized') {
        return;
      }
      try {
        connection.viewer = this.session.viewer(
          connection.connectionId,
          connection.viewer!.userId,
          connection.viewer!.displayName,
          { seatNewcomers: !this.metadata?.game, avatarUrl: connection.avatarUrl }
        );
      } catch {
        this.deny(socket, false);
        return 'activity';
      }
      connection.announced = 'authorized';
      connection.everAuthorized = true;
      return 'admitted';
    }
    if (connection.announced !== 'suspended') {
      connection.announced = 'suspended';
      this.session.clearActivity(connection.connectionId);
      this.sendAdmission(socket, 'suspended');
      return connection.everAuthorized ? 'activity' : undefined;
    }
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
      if (message.updates === 2) {
        this.delivery.enable(socket);
      }
      await this.admit(socket, connection, message.ticket);
      return;
    }
    if (this.reconcileViewers()) {
      this.broadcastActivity(true);
    }
    if (!this.authorized(socket)) {
      this.authorizationChanged();
      return;
    }
    this.sweepActivity();
    try {
      this.advanceDeadlines();
      if (message.type === 'catalogue') {
        await this.capture(connection, () => this.readCatalogue(socket, message));
      } else if (message.type === 'command' && message.action.kind === 'spawn-request') {
        await this.capture(connection, () => this.requestSpawn(socket, connection, message));
      } else {
        this.dispatch(socket, connection, message);
      }
    } catch (error) {
      this.rejectMessage(socket, connection, message, error);
    }
  }

  /** Only a seated player may drive catalogue reads, and only one at a time per connection. */
  private async capture(connection: Connection, read: () => Promise<void>) {
    if (connection.viewer!.viewerSeat === SPECTATOR_SEAT) {
      throw new GameRejection('Only seated players may browse the catalogue.');
    }
    if (connection.capturing) {
      throw new GameRejection('A catalogue request is already in flight.');
    }
    connection.capturing = true;
    try {
      await read();
    } finally {
      connection.capturing = false;
    }
  }

  private async readCatalogue(socket: WebSocket, message: Extract<ClientMessage, { type: 'catalogue' }>) {
    const catalogue = new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN);
    try {
      const result = message.selection
        ? { contents: this.session.projectContents(await catalogue.capture(message.selection)) }
        : { entries: await catalogue.list() };
      if (this.authorized(socket)) {
        this.send(socket, { type: 'catalogue', requestId: message.requestId, ...result });
      }
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      if (this.authorized(socket)) {
        this.send(socket, { type: 'catalogue', requestId: message.requestId, contents: null, error: error.message });
      }
    }
  }

  private async requestSpawn(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'command' }>
  ) {
    if (message.action.kind !== 'spawn-request') {
      return;
    }
    if (this.session.alreadyCommitted(`${connection.viewer!.userId}:${message.commandId}`, message)) {
      this.sendView(socket, connection, message.commandId);
      return;
    }
    const contents = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).capture(message.action);
    /* Catalogue I/O yields. Commit rechecks authorization, the roster and the receipt afterward. */
    this.commit(socket, connection, message, contents);
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

  private dispatch(
    socket: WebSocket,
    connection: Connection,
    message: Exclude<ClientMessage, { type: 'admit' | 'catalogue' }>
  ) {
    switch (message.type) {
      case 'sync':
        connection.conversations ||= message.conversations;
        this.delivery.enable(socket, message.pieceMoves);
        this.sendView(socket, connection);
        return;
      case 'conversation-history':
      case 'conversation-send':
      case 'conversation-read':
        connection.conversations = true;
        this.handleConversation(socket, connection.viewer!, message);
        return;
      case 'log-history':
        this.send(socket, {
          type: 'log-history',
          tab: message.tab,
          before: message.before,
          ...this.session.logPage(message.tab, message.before),
        });
        return;
      case 'removal-history':
        this.send(socket, { type: 'removal-history', before: message.before, entries: [], more: false });
        return;
      case 'spice-history':
        this.send(socket, { type: 'spice-history', before: message.before, ...this.session.spicePage(message.before) });
        return;
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
  private handleConversation(
    socket: WebSocket,
    viewer: Viewer,
    request: Extract<ClientMessage, { type: 'conversation-history' | 'conversation-send' | 'conversation-read' }>
  ) {
    if (request.type === 'conversation-history') {
      this.send(socket, this.session.conversationPage(viewer, request));
    } else if (request.type === 'conversation-read') {
      this.sendConversationReads(this.session.markConversationRead(viewer, request));
    } else {
      const saved = this.session.sendConversation(viewer, request);
      this.publishConversationMessage(request, saved.message);
      if (saved.inserted) {
        this.deliverDirectorySoon();
      }
    }
  }

  private sendConversationReads(faction: string) {
    for (const [peer, identity] of this.connections) {
      if (identity.viewer && this.session.factionFor(identity.viewer.userId) === faction) {
        this.sendConversations(peer, identity.viewer);
      }
    }
  }

  private publishConversationMessage(
    request: Extract<ClientMessage, { type: 'conversation-send' }>,
    message: Extract<ServerMessage, { type: 'conversation-message' }>['message']
  ) {
    const faction = request.factionId;
    /* Only current endpoint owners receive the saved message, including the sender's other connections. */
    for (const [peer, identity] of this.connections) {
      if (!identity.viewer || !identity.conversations || !this.authorized(peer)) {
        continue;
      }
      const own = this.session.conversationFaction(identity.viewer);
      if (own === faction || own === request.peerId) {
        this.send(peer, {
          type: 'conversation-message',
          factionId: own,
          peerId: own === faction ? request.peerId : faction,
          message,
        });
        this.sendConversations(peer, identity.viewer);
      }
    }
  }

  private sendConversations(socket: WebSocket, viewer: Viewer) {
    if (!this.session.ready || !this.connections.get(socket)?.conversations || !this.authorized(socket)) {
      return;
    }
    const message = this.session.conversationSummaries(viewer);
    if (message) {
      this.send(socket, message);
    }
  }

  private sendHistory(socket: WebSocket, step: number) {
    this.send(socket, this.session.historyFor(this.connections.get(socket)!.viewer!, step));
  }

  private sendMetrics(socket: WebSocket) {
    this.send(socket, {
      type: 'metrics',
      revision: this.session.revision,
      historySteps: this.session.historySteps,
      receiptCount: this.session.receiptCount,
      motionReceived: this.motionReceived,
      motionForwarded: this.motionForwarded,
      activityDeliveries: this.activityDeliveries,
      messagesSent: this.messagesSent,
      bytesSent: this.bytesSent,
    });
  }
  private publishActivity(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'pointer' | 'pose' | 'begin' | 'take' | 'renew' | 'cancel' }>
  ) {
    if (message.type === 'pointer' || message.type === 'pose') {
      this.moveActivity(connection, message);
      return;
    }
    const revision = this.session.revision;
    const result = this.session.activity(connection.viewer!, message);
    this.reconcileViewers();
    if (result) {
      this.send(socket, result);
    }
    this.broadcastActivity(this.session.revision !== revision);
  }

  private moveActivity(connection: Connection, message: Extract<ClientMessage, { type: 'pointer' | 'pose' }>) {
    this.motionReceived++;
    const viewer = connection.viewer!;
    if (message.type === 'pointer') {
      if (message.seq <= connection.pointerSeq) {
        return;
      }
      connection.pointerSeq = message.seq;
      this.session.pointer(viewer, message.position, Date.now(), message.seq);
    } else if (!this.session.pose(viewer, message)) {
      return;
    }
    this.motionForwarded++;
    this.activityTimer ??= setTimeout(() => {
      const committed = this.reconcileViewers();
      this.broadcastActivity(committed);
    }, 50);
  }

  private rejectMessage(socket: WebSocket, connection: Connection, message: ClientMessage, error: unknown) {
    if (!(error instanceof GameRejection)) {
      this.diagnostics.report('message', error);
    }
    const revision = this.session.revision;
    if (
      message.type === 'drop' &&
      error instanceof GameRejection &&
      this.session.cancelRejectedDrop(connection.viewer!, message.carryId)
    ) {
      this.reconcileViewers();
      this.broadcastActivity(this.session.revision !== revision);
    }
    this.send(socket, {
      type: 'rejected',
      requestId: messageId(message),
      message: error instanceof GameRejection ? error.message : 'Unable to process the command.',
    });
  }
  private commit(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'command' | 'drop' }>,
    contents?: SpawnContents
  ) {
    if (this.reconcileViewers()) {
      this.broadcastActivity(true);
    }
    if (!this.authorized(socket)) {
      return;
    }
    this.advanceDeadlines();
    if (!this.authorized(socket)) {
      return;
    }
    try {
      if (!this.session.execute(connection.viewer!, message, contents)) {
        this.sendView(socket, connection, message.commandId);
        return;
      }
    } finally {
      if (message.type === 'command' && isDraftAction(message.action)) {
        this.afterDraftChange();
      }
    }
    this.deliverDirectorySoon();
    this.ctx.waitUntil(this.scheduleAlarm().catch((error) => this.diagnostics.report('battle-alarm', error)));
    this.reconcileViewers();
    this.broadcastCommittedView(connection, message);
  }

  private async draftableFactions(rulesetId: string): Promise<DraftFaction[] | null> {
    try {
      return await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).draftableFactions(rulesetId);
    } catch (error) {
      /* A game opens without the list, stamped stale, and reads it on the first draft command. */
      this.diagnostics.report('draft-catalogue', error);
      return null;
    }
  }
  private afterDraftChange() {
    const status = this.session.draftWork();
    if (!status) {
      return;
    }
    if (this.assigning) {
      this.draftChangedDuringAttempt = true;
    }
    if (status.refresh && !this.refreshingCatalogue) {
      this.ctx.waitUntil(
        this.refreshDraftCatalogue().catch((error) => this.diagnostics.report('draft-catalogue', error))
      );
    } else if (!this.assigning) {
      this.ctx.waitUntil(this.attemptAssignment().catch((error) => this.diagnostics.report('assignment', error)));
    }
  }

  /**
   * The latest faction data without resetting readiness (#1013): picks and readiness stay, the factions behind them are read again, and the gates are judged on what the catalogue holds now.
   */
  private async refreshDraftCatalogue() {
    const metadata = this.metadata;
    if (this.refreshingCatalogue || !metadata?.game) {
      return;
    }
    this.refreshingCatalogue = true;
    try {
      const factions = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).draftableFactions(
        metadata.game.rulesetId
      );
      this.session.updateDraftCatalogue(factions);
      this.reconcileViewers();
      this.broadcastViews();
    } catch (error) {
      /* The copy in hand still judges the gates; the next command reads again. */
      this.diagnostics.report('draft-catalogue', error);
    } finally {
      this.refreshingCatalogue = false;
    }
    await this.attemptAssignment();
  }

  /*
   * Public assignment, by itself, once the roster meets the minimum, every player is ready and the
   * pool holds enough factions: the dealt factions are captured first (a real game refuses unready
   * content, an isolated backend deals provisional content), then one transaction fixes the seat
   * count, gives every seat its faction and a random station, ends the draft and opens swapping,
   * provided nothing about the draft or the roster changed while the captures ran. A failure
   * before that commit leaves the draft as it was, with its reason, for a gate-checked retry.
   */
  private async attemptAssignment() {
    if (this.assigning) {
      return;
    }
    const prepared = this.session.prepareAssignment();
    if (!prepared) {
      return;
    }
    this.assigning = true;
    try {
      for (const faction of prepared.factions) {
        await this.retainFactionCapture(faction, [], { provisional: this.metadata?.provisional === true });
      }
      if (this.session.completeAssignment(prepared)) {
        this.deliverDirectorySoon();
        this.reconcileViewers();
        this.broadcastViews();
      }
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        this.diagnostics.report('assignment', error);
      }
      this.session.assignmentFailed(
        error instanceof GameRejection ? error.message : 'The deal did not go through. Try again.'
      );
      this.reconcileViewers();
      this.broadcastViews();
    } finally {
      this.assigning = false;
    }
    if (this.draftChangedDuringAttempt) {
      this.draftChangedDuringAttempt = false;
      await this.attemptAssignment();
    }
  }

  private broadcastCommittedView(
    connection: Connection,
    message: Extract<ClientMessage, { type: 'command' | 'drop' }>
  ) {
    this.clearActivityTimer();
    for (const [peer, identity] of this.connections) {
      if (identity.viewer && this.authorized(peer)) {
        this.send(
          peer,
          this.delivery.update(peer, identity.viewer, this.session.roomFrame(identity.viewer), {
            committed: true,
            completedCommandId: identity.connectionId === connection.connectionId ? message.commandId : undefined,
          })
        );
      }
    }
  }

  private send(socket: WebSocket, message: Exclude<ServerMessage, { type: 'admission' }>) {
    if (!this.authorized(socket) || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      const phaseCooldownMs = Math.max(0, this.session.phaseChangedAt + PHASE_CHANGE_COOLDOWN_MS - Date.now());
      const battleCountdownMs = Math.max(0, this.session.battleDeadline - Date.now());
      const wire = withPreviousBundleFields(message);
      const data = JSON.stringify(
        message.type === 'view' || message.type === 'update'
          ? {
              ...wire,
              ...(message.type === 'view' ? { conversations: true } : {}),
              phaseCooldownMs,
              battleCountdownMs,
            }
          : wire
      );
      socket.send(data);
      if (message.type === 'view' || (message.type === 'update' && message.snapshot)) {
        this.sendConversations(socket, this.connections.get(socket)!.viewer!);
      }
      this.messagesSent++;
      if (message.type === 'activity' || (message.type === 'update' && !message.snapshot)) {
        this.activityDeliveries++;
      }
      this.bytesSent += new TextEncoder().encode(data).byteLength;
    } catch (error) {
      this.diagnostics.report('socket-send', error);
      this.ctx.waitUntil(Promise.resolve().then(() => this.disconnect(socket)));
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
    if (connection.viewer && this.session.ready && this.authorized(socket)) {
      this.send(
        socket,
        this.delivery.view(socket, connection.viewer, this.session.roomFrame(connection.viewer), completedCommandId)
      );
    }
  }

  private clearActivityTimer() {
    clearTimeout(this.activityTimer ?? null);
    this.activityTimer = undefined;
  }

  private broadcastActivity(committed = false) {
    this.clearActivityTimer();
    if (!this.session.ready || !this.connections.size) {
      return;
    }
    for (const [socket, connection] of this.connections) {
      if (connection.viewer && this.authorized(socket)) {
        this.send(
          socket,
          this.delivery.update(socket, connection.viewer, this.session.roomFrame(connection.viewer), { committed })
        );
      }
    }
  }

  private deny(socket: WebSocket, broadcast = true) {
    this.sendAdmission(socket, 'denied');
    this.disconnect(socket, broadcast);
    socket.close(4401, 'Admission refused.');
  }

  private disconnect(socket: WebSocket, broadcast = true) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    this.connections.delete(socket);
    const revision = this.session.revision;
    this.session.disconnect(connection.connectionId);
    if (connection.registrationId && !this.registeredSessions().has(connection.registrationId)) {
      this.authorization?.remove(connection.registrationId);
    }
    if (!this.connections.size) {
      this.closeAuthorization();
    }
    if (broadcast) {
      this.reconcileViewers();
      this.broadcastActivity(this.session.revision !== revision);
    }
  }

  private closeAuthorization() {
    this.clearActivityTimer();
    const authorization = this.authorization;
    this.authorization = undefined;
    const closed = authorization?.close().catch((error) => this.diagnostics.report('authorization-close', error));
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    this.sweepTimer = undefined;
    this.reconciled = false;
    return closed;
  }

  /** Stop background authorization before disconnecting a room for teardown. */
  protected async stopConnections() {
    const closed = this.closeAuthorization();
    for (const socket of this.ctx.getWebSockets()) {
      this.webSocketClose(socket);
    }
    await Promise.allSettled([closed, this.reconcilePromise]);
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

  private sweepActivity() {
    if (!this.session.ready) {
      return;
    }
    const revision = this.session.revision;
    const swept = this.session.sweep();
    const reconciled = this.reconcileViewers();
    if (swept || reconciled) {
      this.broadcastActivity(this.session.revision !== revision);
    }
  }

  private sweepConnections() {
    this.advanceDeadlines();
    this.expirePendingConnections();
    this.authorizationChanged();
    const hasViewers = [...this.connections.values()].some((connection) => connection.viewer);
    if (Date.now() >= this.nextReconcileAt && hasViewers) {
      this.refreshAccounts(true);
    }
    this.sweepActivity();
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
