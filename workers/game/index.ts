import { DurableObject } from 'cloudflare:workers';

import { api } from '../../convex/_generated/api';
import {
  PLAY_AUTH_LEASE_MS,
  PLAY_AUTH_RECOVERY_MS,
  PLAY_AUTH_RENEWAL_MS,
  PLAY_AUTHORIZATION_BATCH_SIZE,
  PLAY_CONFIRMATION_RECOVERY_MS,
  PLAY_CONFIRMATION_RETRY_MS,
  PLAY_PENDING_TIMEOUT_MS,
  playAccountDeletionRequestSchema,
  playConfirmationSchema,
  playProvisioningValidationSchema,
  playProvisionRequestSchema,
  playReconcileAccountsResultSchema,
  playRedeemTicketResultSchema,
} from '../../src/shared/play/admission';
import { playGamePathPattern } from '../../src/shared/play/callbacks';
import {
  PLAY_DIRECTORY_RETRY_CEILING_MS,
  PLAY_DIRECTORY_RETRY_MS,
  playPublishSummaryResultSchema,
} from '../../src/shared/play/directory';
import type { DraftFaction } from '../../src/shared/play/drafting';
import { isDraftAction } from '../../src/shared/play/drafting';
import type { StoredSpawnContents } from '../../src/shared/play/inventory';
import type { ClientMessage, ServerClock, ServerMessage, Viewer } from '../../src/shared/play/protocol';
import {
  KEEPALIVE_PING,
  KEEPALIVE_PONG,
  TICKET_EXPIRED_CLOSE_CODE,
  clientMessageSchema,
} from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { playRetireFixtureRequestSchema } from '../../src/shared/play/retire';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { SPECTATOR_COLOR } from './actors';
import { AuthorizationWatch, gameHttpClient } from './authorization';
import { GameCatalogue } from './catalogue';
import { RoomDelivery } from './delivery';
import { GameDiagnostics } from './diagnostics';
import { FIXTURE_TREACHERY_DECK, hostedFixturePlan } from './fixture';
import type { FixturePlan } from './fixture';
import { isLocalIsolatedRuntime } from './localRuntime';
import type { Metadata } from './session';
import { GameSession } from './session';

/** The seat a real game's creator holds from creation. */

type Connection = {
  connectionId: string;
  openedAt: number;
  admitting: boolean;
  /* One catalogue capture per connection at a time; each capture is a Convex query. */
  capturing: boolean;
  viewer?: Viewer;
  /* The player's public avatar and profile slug as their admission carried them; the actor directory keeps them. */
  avatarUrl?: string | null;
  profileSlug?: string | null;
  registrationId?: string;
  authorizationRound?: number;
  sessionId?: string;
  announced: 'pending' | 'authorized' | 'suspended';
  /* Counts the `suspended` frames the room sent. The page discards its unanswered requests on each one, so a message that arrived before the latest is dropped. */
  suspensions: number;
  everAuthorized: boolean;
  pointerSeq: number;
  tokens: number;
  motionTokens: number;
  refilledAt: number;
};
type TicketAdmission = Extract<ReturnType<typeof playRedeemTicketResultSchema.parse>, { ok: true }>;

/** A ticket that lapsed or was already redeemed. The socket closes without a refusal, so the browser asks for a new ticket. */
class ExpiredTicket extends GameRejection {}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refused = () => json({ error: 'Request refused.' }, 403);
/* Above a steady load cell's 720 saved commands, so a cell's metrics request still finds its first. */
const COMMAND_TIMINGS = 1024;
/** Each connection's message buckets hold this many messages and refill at this rate. */
const RATE_BURST = 120;
const RATE_PER_SECOND = 60;
const SWEEP_MS = 1000;
/** A sweep this late counts as a stall, and the room keeps the most recent ones. */
const STALL_MS = 250;
const STALLS = 64;
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
  const match = playGamePathPattern.exec(url.pathname);
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

/** A promise the room resolves by hand, once, for handlers that wait on an event. */
function latch() {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { released, release };
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
  /*
   * Open from a watch denial until the account reconciliation started after it settles.
   * The missing lease already holds back every game frame and command meanwhile.
   * A connection whose own grant stands is held rather than suspended: it is not told, it keeps its carry and pointer, and its messages wait here.
   */
  private fence: ReturnType<typeof latch> | undefined;
  private motionReceived = 0;
  private motionForwarded = 0;
  private motionDropped = 0;
  private activityDeliveries = 0;
  private messagesSent = 0;
  private bytesSent = 0;
  /*
   * When this object began handling each recent saved command, by its own clock, for the load runner's metrics request.
   * A Worker's clock stands still while code runs, so only when handling began is meaningful, not how long it took.
   * A spawn request is timed after its catalogue read, so its entry includes that read.
   */
  private readonly commandTimings: { userId: string; commandId: string; handledAt: number; durableAt?: number }[] = [];
  /* Recent sweeps that ran late by more than STALL_MS: a busy room fires its timers late, while a held output does not. */
  private readonly stalls: { at: number; lateMs: number }[] = [];
  private sweptAt: number | undefined;
  private readonly session!: GameSession;
  /*
   * Set when the stored game no longer loads, or once the room is retired.
   * Such a room answers only a retirement, so no handler reaches the session it could not open.
   */
  private closed = false;
  private loadFailure: unknown;
  private retired = false;
  private get metadata() {
    return this.session.info;
  }
  constructor(
    ctx: DurableObjectState,
    env: GameEnv,
    /* The production Worker provisions only the hosted fixture; a load entry passes the load fixture's plan. */
    private readonly fixturePlan: FixturePlan = hostedFixturePlan
  ) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_PING, KEEPALIVE_PONG));
    this.diagnostics = new GameDiagnostics(ctx.id.toString(), env.GIT_SHA);
    try {
      /* A start that fails keeps none of its writes, as a throwing constructor's would not. */
      this.session = ctx.storage.transactionSync(() => new GameSession(ctx.storage, fixturePlan));
    } catch (error) {
      this.diagnostics.report('load', error);
      this.closed = true;
      this.loadFailure = error;
    }
    if (!this.closed && this.metadata) {
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
  private async captureFixtureDeck(): Promise<StoredSpawnContents | undefined> {
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
   * They are protected so the native fixture can also drive them directly.
   */
  protected async retainRulesetCapture(rulesetId: string, options: { provisional?: boolean } = {}) {
    const existing = this.session.retainedRuleset(rulesetId);
    if (existing) {
      return existing;
    }
    const capture = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).captureRuleset(rulesetId);
    return this.session.retainRuleset(capture, options);
  }

  protected async retainFactionCapture(factionId: string, options: { provisional?: boolean } = {}) {
    const existing = this.session.retainedFaction(factionId);
    if (existing) {
      return existing;
    }
    const capture = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).captureFaction(factionId);
    return this.session.retainFaction(capture, options);
  }

  override async fetch(request: Request): Promise<Response> {
    const route = gameRequest(request, this.env.APPLICATION_ORIGIN);
    if (!route) {
      return refused();
    }
    const { gameId, operation } = route;
    if (operation === 'retire') {
      return this.retire(request, gameId);
    }
    if (this.closed) {
      return refused();
    }
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
        api.playProvisioning.validateProvisioning,
        args
      );
      const validation = playProvisioningValidationSchema.parse(raw);
      /* Fail closed: a game without the real phase cooldown is provisioned only in the isolated local stack. */
      if (validation.ok && validation.testPhaseCooldownMs !== undefined && !isLocalIsolatedRuntime(this.env)) {
        throw new Error('A test phase cooldown is refused outside the isolated local runtime.');
      }
      /* A real game retains its ruleset before it exists; a ruleset that is not ready never becomes a game. */
      if (validation.ok && 'game' in validation && !this.metadata) {
        try {
          await this.retainRulesetCapture(validation.game.rulesetId, { provisional: validation.provisional === true });
        } catch (error) {
          if (!(error instanceof GameRejection)) {
            throw error;
          }
          if (!this.metadata) {
            await gameHttpClient(this.env.CONVEX_URL).mutation(api.playProvisioning.failProvisioning, {
              ...args,
              reason: error.message,
            });
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
        validation.ok && 'fixtureKey' in validation && this.fixturePlan.hosted && !this.metadata
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
    fixtureDeck?: StoredSpawnContents
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
        ...('game' in validation ? { game: validation.game } : {}),
        ...('provisional' in validation && validation.provisional ? { provisional: true } : {}),
        ...(validation.testPhaseCooldownMs === undefined
          ? {}
          : { testPhaseCooldownMs: validation.testPhaseCooldownMs }),
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

  /*
   * Read straight from storage, not through the session, so a room whose game no longer loads can still authenticate.
   * Only a room without a metadata table or row reads as empty; unreadable metadata throws.
   */
  private storedMetadata(): Metadata | undefined {
    const sql = this.ctx.storage.sql;
    if (!sql.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").toArray().length) {
      return undefined;
    }
    const row = sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    return row ? (JSON.parse(row.data) as Metadata) : undefined;
  }

  /*
   * Deletes everything the hosted fixture's room stores, so account deletion reaches the names it retained.
   * Only the hosted fixture retires; a real game or a load fixture is refused.
   * An empty room has nothing left to retire, so a repeated request succeeds.
   */
  private async retire(request: Request, gameId: string): Promise<Response> {
    let args: ReturnType<typeof playRetireFixtureRequestSchema.parse>;
    try {
      args = playRetireFixtureRequestSchema.parse(await readJson(request));
    } catch {
      return refused();
    }
    if (args.gameId !== gameId) {
      return refused();
    }
    let metadata: Metadata | undefined;
    try {
      metadata = this.storedMetadata();
    } catch (error) {
      this.diagnostics.report('retire', error);
      return refused();
    }
    if (!metadata) {
      return json({ ok: true });
    }
    if (
      metadata.gameId !== gameId ||
      !credentialsMatch(args.secret, metadata.secret) ||
      metadata.game ||
      !this.fixturePlan.hosted
    ) {
      return refused();
    }
    try {
      if (!this.closed) {
        for (const socket of this.connections.keys()) {
          this.disconnect(socket, false);
        }
        await this.closeAuthorization();
      }
      this.closed = true;
      this.retired = true;
      for (const socket of this.ctx.getWebSockets()) {
        socket.close(1000, 'This table is closed.');
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    } catch (error) {
      this.diagnostics.report('retire', error);
      return refused();
    }
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
      const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(api.playAdmission.ackAccountDeletion, {
        gameId: metadata.gameId,
        secret: metadata.secret,
        eventId: args.eventId,
      });
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
      suspensions: 0,
      everAuthorized: false,
      pointerSeq: -1,
      tokens: RATE_BURST,
      motionTokens: RATE_BURST,
      refilledAt: Date.now(),
    });
    this.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async alarm() {
    if (this.loadFailure !== undefined && !this.retired) {
      /* A failed alarm is retried a few times, so a deadline outlives a brief load failure. */
      throw this.loadFailure;
    }
    if (this.closed) {
      return;
    }
    if (this.metadata?.confirmed) {
      this.advanceDeadlines();
      await this.deliverDirectory();
    } else {
      await this.confirmProvisioning();
    }
  }

  /** One alarm serves the battle deadline and the directory retry: whichever is due first. */
  private scheduleAlarm() {
    if (this.closed) {
      return Promise.resolve();
    }
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
        const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(api.playDirectory.publishSummary, {
          gameId: metadata.gameId,
          secret: metadata.secret,
          sequence: pending.sequence,
          summary: pending.summary,
        });
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
        api.playProvisioning.confirmProvisioning,
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
    this.reconcilePromise = this.reconcileDirectory(this.metadata!);
    try {
      await this.reconcilePromise;
      this.reconcileFailures = 0;
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

  /*
   * Passes over every retained account until one pass ran with no denial or deletion landing during it; only that pass restores the lease.
   * A stale pass is followed at once by the next, so whoever waits on the reconciliation, an admission included, gets a current answer.
   */
  private async reconcileDirectory(metadata: Metadata) {
    while (true) {
      const epoch = this.reconcileEpoch;
      const requestStartedAt = Date.now();
      this.nextReconcileAt = requestStartedAt + PLAY_AUTH_RENEWAL_MS;
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
        return;
      }
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
    const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).query(api.playAdmission.reconcileAccounts, {
      gameId: metadata.gameId,
      secret: metadata.secret,
      userIds,
    });
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
    const raw: unknown = await gameHttpClient(this.env.CONVEX_URL).mutation(api.playAdmission.redeemTicket, {
      gameId: metadata.gameId,
      secret: metadata.secret,
      ticket,
    });
    const result = playRedeemTicketResultSchema.parse(raw);
    if (!result.ok && result.reason === 'expired') {
      throw new ExpiredTicket('Admission ticket expired.');
    }
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
    connection.profileSlug = result.profileSlug;
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
      if (error instanceof ExpiredTicket) {
        this.disconnect(socket);
        socket.close(TICKET_EXPIRED_CLOSE_CODE, error.message);
        return;
      }
      if (!(error instanceof GameRejection)) {
        this.diagnostics.report('admission', error);
      }
      this.deny(socket);
    }
  }

  private authorized(socket: WebSocket): boolean {
    return this.hasAccountLease() && this.granted(socket);
  }

  /** The connection's own admission: its watch grant and, once admitted, its seat. The room's account lease is checked apart. */
  private granted(socket: WebSocket): boolean {
    const connection = this.connections.get(socket);
    if (!connection?.viewer || !connection.registrationId || connection.authorizationRound === undefined) {
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
    const connections = [...this.connections.values()].filter(
      (connection): connection is Connection & { viewer: Viewer } => !!connection.viewer && connection.everAuthorized
    );
    const viewers = this.session.refreshViewers(connections.map((connection) => connection.viewer));
    connections.forEach((connection, index) => {
      connection.viewer = viewers[index] ?? connection.viewer;
    });
    return this.session.revision !== revision;
  }

  /** The fence an admitted connection waits behind while its own grant stands, if one is open. */
  private fenceFor(socket: WebSocket, connection: Connection) {
    return connection.announced === 'authorized' && this.granted(socket) ? this.fence : undefined;
  }

  /** Lifts the fence once its reconciliation restored the lease, failed or outlasted the lease, and reports whether held connections resume. */
  private settleFence() {
    const fence = this.fence;
    if (!fence || (!this.reconciled && Date.now() < this.reconcileUntil)) {
      return false;
    }
    this.fence = undefined;
    fence.release();
    return this.hasAccountLease();
  }

  private authorizationChanged() {
    const resumed = this.settleFence();
    const revision = this.session.revision;
    this.reconcileViewers();
    const admitted = new Set<WebSocket>();
    let activityChanged = false;
    let denied = false;
    for (const [socket, connection] of this.connections) {
      const change = this.updateConnectionAuthorization(socket, connection);
      if (change === 'admitted') {
        admitted.add(socket);
      }
      denied ||= change === 'denied';
      activityChanged ||= change === 'activity' || change === 'denied';
    }
    /* One push can deny several connections, such as every tab of a signed-out session; one reconciliation started after all of them covers them all. */
    if (denied) {
      this.refreshAccounts();
    }
    this.reconcileViewers();
    /* A held connection missed every frame of the fence; its update is computed against the last frame it received. */
    if (admitted.size || resumed) {
      const frameFor = this.framePass();
      for (const [socket, connection] of this.connections) {
        if (!connection.viewer || !this.authorized(socket)) {
          continue;
        }
        if (admitted.has(socket)) {
          /* A resumed connection leaves suspension only after receiving a full view. */
          this.sendView(socket, connection);
        } else {
          this.send(socket, this.delivery.update(socket, connection.viewer, frameFor(connection.viewer)));
        }
      }
    } else if (activityChanged || this.session.revision !== revision) {
      this.broadcastActivity();
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
      this.fence ??= latch();
      this.deny(socket, false);
      return 'denied';
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
          {
            seatNewcomers: !this.metadata?.game,
            avatarUrl: connection.avatarUrl,
            profileSlug: connection.profileSlug,
          }
        );
      } catch {
        this.deny(socket, false);
        return 'activity';
      }
      connection.announced = 'authorized';
      connection.everAuthorized = true;
      return 'admitted';
    }
    if (this.fenceFor(socket, connection)) {
      return;
    }
    if (connection.announced !== 'suspended') {
      connection.announced = 'suspended';
      connection.suspensions++;
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
    if (this.closed) {
      socket.close(1000, 'This table is closed.');
      return;
    }
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
    if (message.type === 'pointer' || message.type === 'pose') {
      this.receiveMotion(socket, connection, message);
      return;
    }
    if (this.reconcileViewers()) {
      this.broadcastActivity();
    }
    const suspensions = connection.suspensions;
    if (!(await this.outlastFence(socket, connection, suspensions))) {
      this.authorizationChanged();
      return;
    }
    this.sweepActivity();
    try {
      this.advanceDeadlines();
      if (message.type === 'catalogue') {
        await this.capture(connection, () => this.readCatalogue(socket, connection, message, suspensions));
      } else if (message.type === 'command' && message.action.kind === 'spawn-request') {
        await this.capture(connection, () => this.requestSpawn(socket, connection, message, suspensions));
      } else {
        this.dispatch(socket, connection, message);
      }
    } catch (error) {
      /* A capture that failed while a fence held its connection is refused once the fence lifts. */
      await this.outlastFence(socket, connection, suspensions);
      this.rejectMessage(socket, connection, message, error);
    }
  }

  /*
   * Motion arrives at up to 40 frames a second per mover, so it skips the per-message upkeep a command needs.
   * Seats, expired carries and deadlines are settled by the 50 ms activity pass and the one-second sweep, and a frame from a held or refused connection is dropped, since the next one supersedes it.
   */
  private receiveMotion(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'pointer' | 'pose' }>
  ) {
    if (!this.session.ready || !this.authorized(socket)) {
      return;
    }
    try {
      this.moveActivity(connection, message);
    } catch (error) {
      this.rejectMessage(socket, connection, message, error);
    }
  }

  /*
   * A held connection's message, and a catalogue capture it started, wait here for the fence to lift, then meet the same check as any other.
   * Resolves to whether the connection may still act on a message that arrived after `suspensions` pauses.
   * A pause since then drops the message, even when the connection was admitted again, because the page discarded its unanswered requests on the pause.
   */
  private async outlastFence(socket: WebSocket, connection: Connection, suspensions: number) {
    for (
      let fence = this.fenceFor(socket, connection);
      fence && !this.authorized(socket);
      fence = this.fenceFor(socket, connection)
    ) {
      await fence.released;
    }
    return this.authorized(socket) && connection.suspensions === suspensions;
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

  private async readCatalogue(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'catalogue' }>,
    suspensions: number
  ) {
    const catalogue = new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN);
    try {
      const result = message.selection
        ? { contents: this.session.projectContents(await catalogue.capture(message.selection)) }
        : { entries: await catalogue.list() };
      if (await this.outlastFence(socket, connection, suspensions)) {
        this.send(socket, { type: 'catalogue', requestId: message.requestId, ...result });
      }
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      if (await this.outlastFence(socket, connection, suspensions)) {
        this.send(socket, { type: 'catalogue', requestId: message.requestId, contents: null, error: error.message });
      }
    }
  }

  private async requestSpawn(
    socket: WebSocket,
    connection: Connection,
    message: Extract<ClientMessage, { type: 'command' }>,
    suspensions: number
  ) {
    if (message.action.kind !== 'spawn-request') {
      return;
    }
    if (this.session.alreadyCommitted(`${connection.viewer!.userId}:${message.commandId}`, message)) {
      this.sendView(socket, connection, message.commandId);
      return;
    }
    const contents = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).capture(message.action);
    /* Catalogue I/O yields, so the request waits out a fence like a new message. Commit rechecks authorization, the roster and the receipt afterward. */
    if (await this.outlastFence(socket, connection, suspensions)) {
      this.commit(socket, connection, message, contents);
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
    let message: ClientMessage;
    try {
      message = clientMessageSchema.parse(JSON.parse(input));
    } catch {
      this.deny(socket);
      return;
    }
    const now = Date.now();
    const refill = (tokens: number) =>
      Math.min(RATE_BURST, tokens + (Math.max(0, now - connection.refilledAt) * RATE_PER_SECOND) / 1000);
    connection.tokens = refill(connection.tokens);
    connection.motionTokens = refill(connection.motionTokens);
    connection.refilledAt = now;
    /*
     * The refill follows the room's clock, which stands still while the room runs code, so a busy room can see a steady mover's frames as a burst.
     * Pointer and pose frames draw on their own bucket. When it runs dry they are dropped, since the next frame supersedes them, and only a second bucket's worth of dropped motion closes the socket.
     */
    if (message.type === 'pointer' || message.type === 'pose') {
      connection.motionTokens--;
      if (connection.motionTokens >= 0) {
        return message;
      }
      if (connection.motionTokens > -RATE_BURST) {
        this.motionDropped++;
        return;
      }
    } else if (connection.tokens >= 1) {
      connection.tokens--;
      return message;
    }
    this.refuseRate(socket);
  }

  private refuseRate(socket: WebSocket) {
    this.disconnect(socket);
    socket.close(4413, 'Too many requests.');
  }

  private dispatch(
    socket: WebSocket,
    connection: Connection,
    message: Exclude<ClientMessage, { type: 'admit' | 'catalogue' }>
  ) {
    switch (message.type) {
      case 'sync':
        this.sendView(socket, connection);
        return;
      case 'conversation-history':
      case 'conversation-send':
      case 'conversation-read':
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
      if (!identity.viewer || !this.authorized(peer)) {
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
    if (!this.session.ready || !this.authorized(socket)) {
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
    const userId = this.connections.get(socket)?.viewer?.userId;
    this.send(socket, {
      type: 'metrics',
      revision: this.session.revision,
      historySteps: this.session.historySteps,
      receiptCount: this.session.receiptCount,
      motionReceived: this.motionReceived,
      motionForwarded: this.motionForwarded,
      motionDropped: this.motionDropped,
      activityDeliveries: this.activityDeliveries,
      messagesSent: this.messagesSent,
      bytesSent: this.bytesSent,
      commands: this.commandTimings
        .filter((timing) => timing.userId === userId)
        .map(({ commandId, handledAt, durableAt }) => ({ commandId, handledAt, durableAt })),
      stalls: this.stalls,
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
    const committed = this.session.revision !== revision;
    /* A renew moves only the carry's expiresAt, which no page acts on, so no frame goes out for it. */
    if (message.type !== 'renew' || committed) {
      this.broadcastActivity();
    }
  }

  private moveActivity(connection: Connection, message: Extract<ClientMessage, { type: 'pointer' | 'pose' }>) {
    this.motionReceived++;
    const viewer = connection.viewer!;
    if (message.type === 'pointer') {
      if (message.seq <= connection.pointerSeq) {
        return;
      }
      connection.pointerSeq = message.seq;
      /* A resend at the same position moves only updatedAt, which no page acts on, so no frame goes out for it. */
      if (!this.session.pointer(viewer, message.position, Date.now(), message.seq)) {
        return;
      }
    } else if (!this.session.pose(viewer, message)) {
      return;
    }
    this.motionForwarded++;
    this.activityTimer ??= setTimeout(() => {
      this.reconcileViewers();
      this.broadcastActivity();
    }, 50);
  }

  private rejectMessage(socket: WebSocket, connection: Connection, message: ClientMessage, error: unknown) {
    if (!(error instanceof GameRejection)) {
      this.diagnostics.report('message', error);
    }
    if (
      message.type === 'drop' &&
      error instanceof GameRejection &&
      this.session.cancelRejectedDrop(connection.viewer!, message.carryId)
    ) {
      this.reconcileViewers();
      this.broadcastActivity();
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
    contents?: StoredSpawnContents
  ) {
    const timing: (typeof this.commandTimings)[number] = {
      userId: connection.viewer!.userId,
      commandId: message.commandId,
      handledAt: Date.now(),
    };
    this.commandTimings.push(timing);
    if (this.commandTimings.length > COMMAND_TIMINGS) {
      this.commandTimings.shift();
    }
    if (this.reconcileViewers()) {
      this.broadcastActivity();
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
    /* Frames sent after a write leave the room once the write is durable, so the confirmation's arrival bounds how long they were held. */
    this.ctx.waitUntil(
      this.ctx.storage
        .sync()
        .then(() => {
          timing.durableAt = Date.now();
        })
        .catch((error) => this.diagnostics.report('storage-sync', error))
    );
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
        await this.retainFactionCapture(faction, { provisional: this.metadata?.provisional === true });
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
    const frameFor = this.framePass();
    for (const [peer, identity] of this.connections) {
      if (identity.viewer && this.authorized(peer)) {
        this.send(
          peer,
          this.delivery.update(
            peer,
            identity.viewer,
            frameFor(identity.viewer),
            identity.connectionId === connection.connectionId ? message.commandId : undefined
          )
        );
      }
    }
  }

  private send(socket: WebSocket, message: Exclude<ServerMessage, { type: 'admission' }>) {
    if (!this.authorized(socket) || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      const clock: ServerClock = { serverNow: Date.now() };
      const phaseCooldownMs = Math.max(0, this.session.phaseCooldownEndsAt - clock.serverNow);
      const battleCountdownMs = Math.max(0, this.session.battleDeadline - clock.serverNow);
      const data = JSON.stringify(
        message.type === 'view' || message.type === 'update'
          ? {
              ...message,
              phaseCooldownMs,
              battleCountdownMs,
              ...clock,
            }
          : { ...message, ...clock }
      );
      socket.send(data);
      if (message.type === 'view' || (message.type === 'update' && message.snapshot)) {
        this.sendConversations(socket, this.connections.get(socket)!.viewer!);
      }
      this.messagesSent++;
      if (message.type === 'update' && !message.snapshot) {
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

  private broadcastActivity() {
    this.clearActivityTimer();
    if (!this.session.ready || !this.connections.size) {
      return;
    }
    const frameFor = this.framePass();
    for (const [socket, connection] of this.connections) {
      if (connection.viewer && this.authorized(socket)) {
        this.send(socket, this.delivery.update(socket, connection.viewer, frameFor(connection.viewer)));
      }
    }
  }

  /** One pass's frames, built on first use so a pass that sends nothing reads no room state. */
  private framePass() {
    let frames: ReturnType<GameSession['roomFrames']> | undefined;
    return (viewer: Viewer) => (frames ??= this.session.roomFrames())(viewer);
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
    this.session.disconnect(connection.connectionId);
    if (connection.registrationId && !this.registeredSessions().has(connection.registrationId)) {
      this.authorization?.remove(connection.registrationId);
    }
    if (!this.connections.size) {
      this.closeAuthorization();
    }
    if (broadcast) {
      this.reconcileViewers();
      this.broadcastActivity();
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
    this.sweptAt = undefined;
    this.reconciled = false;
    /* No connection is left to hold; a message still waiting finds its socket gone. */
    this.fence?.release();
    this.fence = undefined;
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
    this.sweepTimer ??= setInterval(() => {
      this.noteStall();
      this.sweepConnections();
    }, SWEEP_MS);
  }

  private noteStall() {
    const now = Date.now();
    const lateMs = this.sweptAt === undefined ? 0 : now - this.sweptAt - SWEEP_MS;
    this.sweptAt = now;
    if (lateMs > STALL_MS) {
      this.stalls.push({ at: now, lateMs });
      if (this.stalls.length > STALLS) {
        this.stalls.shift();
      }
    }
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
    const swept = this.session.sweep();
    const reconciled = this.reconcileViewers();
    if (swept || reconciled) {
      this.broadcastActivity();
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
    if (!this.closed) {
      this.disconnect(socket);
    }
    socket.close(1000, 'Connection closed.');
  }
  override webSocketError(socket: WebSocket, error: unknown) {
    this.diagnostics.report('socket-error', error);
    if (!this.closed) {
      this.disconnect(socket);
    }
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
