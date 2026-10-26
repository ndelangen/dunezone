export { HomepageRoom } from './homepage';
export { BugReports } from './bugReports';
import { Buffer } from 'node:buffer';

import { DurableObject } from 'cloudflare:workers';

import { api } from '../../convex/_generated/api';
import { HOMEPAGE_SOCKET_PATH } from '../../src/shared/homepage/protocol';
import {
  PLAY_AUTH_RECOVERY_MS,
  PLAY_CONFIRMATION_RECOVERY_MS,
  PLAY_CONFIRMATION_RETRY_MS,
  PLAY_PENDING_TIMEOUT_MS,
  playAccountDeletionRequestSchema,
  playConfirmationSchema,
  playProvisioningValidationSchema,
  playProvisionRequestSchema,
  playSeatLimitResultSchema,
  playSessionCutoffRequestSchema,
} from '../../src/shared/play/admission';
import { bugReportIdSchema, bugReportRequestSchema } from '../../src/shared/play/bugReports';
import type { BugReportBrowser, BugReportRequest } from '../../src/shared/play/bugReports';
import { playGamePathPattern } from '../../src/shared/play/callbacks';
import { conversationPeerFor } from '../../src/shared/play/conversations';
import type { DraftFaction } from '../../src/shared/play/drafting';
import { isDraftAction } from '../../src/shared/play/drafting';
import type { StoredSpawnContents } from '../../src/shared/play/inventory';
import { CLIENT_MESSAGE_LIMIT } from '../../src/shared/play/messageLimit';
import type {
  ClientMessage,
  CommitMessage,
  PingSound,
  ServerClock,
  ServerMessage,
  Viewer,
} from '../../src/shared/play/protocol';
import {
  ADMISSION_REFUSED_CLOSE_CODE,
  KEEPALIVE_PING,
  KEEPALIVE_PONG,
  PASS_EXPIRED_CLOSE_CODE,
  RATE_LIMITED_CLOSE_CODE,
  TABLE_PING_INTERVAL_MS,
  clientMessageSchema,
} from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { playRetireFixtureRequestSchema } from '../../src/shared/play/retire';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { SeatPassPayload } from '../../src/shared/play/seatPass';
import { SPECTATOR_COLOR } from './actors';
import { handleAlertWebhook } from './alerts';
import type { AlertEnv } from './alerts';
import { bugReportExport } from './bugReportExport';
import { bugReportGamePathPattern, isBugReportRequest } from './bugReportHttp';
import { GameCatalogue } from './catalogue';
import { RoomDelivery } from './delivery';
import type { AdmissionRefusal } from './diagnostics';
import { GameDiagnostics } from './diagnostics';
import { DirectoryDelivery } from './directoryDelivery';
import { FIXTURE_TREACHERY_DECK, hostedFixturePlan } from './fixture';
import type { FixturePlan } from './fixture';
import { gameHttpClient } from './gameHttpClient';
import { isLocalIsolatedRuntime } from './localRuntime';
import { forwardPrivacyRequest } from './privacyRequests';
import { provisionThroughSetup } from './provisionThroughSetup';
import { CarryHistoryExhausted } from './room';
import { RoomDraft } from './roomDraft';
import type { SavedSummary } from './roomSummary';
import { RoomSummary } from './roomSummary';
import type { ConvexCall } from './roomSummary';
import type { HeldPass } from './seatPasses';
import { heldPass, SeatPasses } from './seatPasses';
import { gameServiceResponse } from './serviceHttp';
import type { Metadata } from './session';
import { GameSession } from './session';

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
  /* Whether the player already held the most seats one player may when this connection was admitted. */
  seatLimitReached?: boolean;
  /* The seat pass this connection entered with, or its latest renewal. */
  pass?: HeldPass;
  /* The expiry of the pass this connection was last told had run out. */
  expiryAnnounced?: number;
  /* The connection the same page held before it reconnected; it is closed once this one is admitted. */
  replaces?: string;
  sessionId?: string;
  announced: 'pending' | 'authorized' | 'suspended';
  /* Counts the `suspended` frames the room sent. The page discards its unanswered requests on each one, so a message that arrived before the latest is dropped. */
  suspensions: number;
  everAuthorized: boolean;
  pointerSeq: number;
  /* When this connection last pinged, by the room's clock. */
  pingedAt: number;
  /* When this connection's last ping carried the rumble. */
  rumbledAt: number;
  tokens: number;
  motionTokens: number;
  commandTokens: number;
  refilledAt: number;
};
/*
 * What an admitted connection keeps in its socket, so the room can hibernate between moves and wake with its players still connected.
 * The rest is either work in flight, which hibernation never interrupts, or a rate limit that refills while the room sleeps.
 */
type RememberedConnection = Pick<
  Connection,
  | 'connectionId'
  | 'openedAt'
  | 'viewer'
  | 'seatLimitReached'
  | 'pass'
  | 'expiryAnnounced'
  | 'sessionId'
  | 'announced'
  | 'suspensions'
> & {
  /* The room's activity epoch and revision when this socket last heard from it, so a woken room keeps the epoch and resends a state it moved on from. */
  epoch?: string;
  revision?: number;
};
function openConnection(
  state: Pick<Connection, 'connectionId' | 'openedAt'> &
    Partial<Pick<Connection, Exclude<keyof RememberedConnection, 'epoch' | 'revision'> | 'everAuthorized'>>
): Connection {
  return {
    admitting: false,
    capturing: false,
    announced: 'pending',
    suspensions: 0,
    everAuthorized: false,
    pointerSeq: -1,
    pingedAt: 0,
    rumbledAt: 0,
    tokens: RATE_BURST,
    motionTokens: RATE_BURST,
    commandTokens: COMMAND_BURST,
    refilledAt: Date.now(),
    ...state,
  };
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const refused = () => json({ error: 'Request refused.' }, 403);
/* Above a steady load cell's 720 saved commands, so a cell's metrics request still finds its first. */
const COMMAND_TIMINGS = 1024;
/** Each connection's message buckets hold this many messages and refill at this rate. */
const RATE_BURST = 120;
const RATE_PER_SECOND = 60;
/*
 * Table commands draw on a smaller bucket of their own, since each one writes the table and sends every player a frame.
 * Play by hand stays well inside it; a command over it is refused on its own, so the room never spends a write or a frame on it.
 */
const COMMAND_BURST = 30;
const COMMANDS_PER_SECOND = 10;
/* A held Tab rumbles after three seconds, so one connection rumbles at most that often. */
const RUMBLE_INTERVAL_MS = 3000;

/* A page rumbles only after Tab is held for seconds, so a rumble sooner than that after the last goes out as a plain ping. */
function pingSoundAllowed(connection: Pick<Connection, 'rumbledAt'>, sound: PingSound | undefined, now: number) {
  if (!sound || now - connection.rumbledAt < RUMBLE_INTERVAL_MS) {
    return undefined;
  }
  connection.rumbledAt = now;
  return sound;
}
const COMMAND_RATE_REFUSAL = 'You are acting too fast. Wait a moment, then try again.';
const SWEEP_MS = 1000;
/* Where a connection's used carry IDs wait out a hibernation; too many to fit its socket attachment. */
const carryHistoryKey = (connectionId: string) => `carry-history:${connectionId}`;
/* Set while the room is quiet with its sweep stopped, the only state it hibernates in; a restart without it lost work in flight. */
const QUIET_KEY = 'quiet';
/* The summary interval a quiet room has not written yet, kept until it wakes. */
const SUMMARY_KEY = 'room-summary';
/* A normal close the page reconnects after, unlike a refusal. */
const SEAT_CHANGED_CLOSE_CODE = 1012;
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
  const match = playGamePathPattern.exec(url.pathname) ?? bugReportGamePathPattern.exec(url.pathname);
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
type ProvisionArgs = ReturnType<typeof playProvisionRequestSchema.parse>;
/** An attempt Convex validated: a hosted fixture or a real game. A refused one never reaches initialization. */
type ProvisioningValidation = Extract<ReturnType<typeof playProvisioningValidationSchema.parse>, { ok: true }>;
type PageRead = Extract<ClientMessage, { type: 'log-history' | 'spice-history' | 'faction' }>;
const isPageRead = (message: ClientMessage): message is PageRead =>
  message.type === 'log-history' || message.type === 'spice-history' || message.type === 'faction';

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
/** A request body as its schema reads it, or undefined when it is missing, oversized, not JSON or not that shape. */
async function readRequest<T>(
  request: Request,
  schema: { parse(value: unknown): T },
  limit = 8192
): Promise<T | undefined> {
  if (!request.body || Number(request.headers.get('Content-Length') ?? 0) > limit) {
    return undefined;
  }
  try {
    return schema.parse(JSON.parse(await readLimitedBody(request.body, limit)));
  } catch {
    return undefined;
  }
}
async function readLimitedBody(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
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
      if (length > limit) {
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
export class GameRoom extends DurableObject<GameEnv> {
  private readonly directory: DirectoryDelivery;
  private readonly draft: RoomDraft;
  protected readonly diagnostics: GameDiagnostics;
  private confirmationEpoch = 0;
  private readonly connections = new Map<WebSocket, Connection>();
  /* The conversation summaries each socket last received, so a snapshot update that left them alone sends none. */
  private readonly conversationsSent = new WeakMap<WebSocket, string>();
  private readonly delivery = new RoomDelivery();
  /* What each socket's attachment last held, so a handler that changed nothing writes none. */
  private readonly remembered = new WeakMap<WebSocket, string>();
  /* How many carry IDs each connection had when its history was last saved. */
  private readonly savedCarryHistory = new Map<string, number>();
  private activityTimer: ReturnType<typeof setTimeout> | undefined;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  /* The alarm this instance last set, or null for none; undefined until it sets one, since the stored alarm is then unknown. */
  private alarmAt: number | null | undefined;
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
  /* What this room did each interval, for measuring live sessions; see roomSummary.ts. */
  private readonly summary = new RoomSummary(() => ({
    roomId: this.ctx.id.toString(),
    gitSha: this.env.GIT_SHA,
    workerVersionId: this.env.CF_VERSION_METADATA.id,
  }));
  private readonly observeConvex = (call: ConvexCall) => {
    this.summary.convexCall(call);
    /* A call that outlived the sweep settles in a quiet room, so the summary it saved is saved again with this call. */
    if (!this.sweepTimer) {
      this.resaveSummary ??= setTimeout(() => {
        this.resaveSummary = undefined;
        if (!this.sweepTimer && !this.closed) {
          this.ctx.storage.kv.put(SUMMARY_KEY, this.summary.save(this.counters()));
        }
      });
    }
  };
  /* Waits until the work the call settled has run, so what it sent is saved too. */
  private resaveSummary: ReturnType<typeof setTimeout> | undefined;
  private passes: SeatPasses | undefined;
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
  private convex() {
    return gameHttpClient(this.env.CONVEX_URL, this.observeConvex);
  }
  constructor(
    ctx: DurableObjectState,
    env: GameEnv,
    /* The production Worker provisions only the hosted fixture; a load entry passes the load fixture's plan. */
    private readonly fixturePlan: FixturePlan = hostedFixturePlan
  ) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_PING, KEEPALIVE_PONG));
    this.diagnostics = new GameDiagnostics(ctx.id.toString(), env.GIT_SHA, () => ({
      roomClass: 'GameRoom',
      workerVersionId: env.CF_VERSION_METADATA.id,
      revision: this.session?.ready ? this.session.revision : undefined,
      connections: this.connections.size,
    }));
    try {
      /* A start that fails keeps none of its writes, as a throwing constructor's would not. */
      this.session = ctx.storage.transactionSync(
        () => new GameSession(ctx.storage, fixturePlan, (userId) => this.atSeatLimit(userId))
      );
    } catch (error) {
      this.diagnostics.report('load', error);
      this.closed = true;
      this.loadFailure = error;
    }
    /* A room that did not load never reaches its directory or draft, so it may hold no session. */
    this.directory = new DirectoryDelivery({
      session: this.session,
      diagnostics: this.diagnostics,
      convex: () => this.convex(),
      scheduleAlarm: () => this.scheduleAlarm(),
      waitUntil: (work) => this.ctx.waitUntil(work),
    });
    this.draft = new RoomDraft({
      session: this.session,
      diagnostics: this.diagnostics,
      catalogue: () => this.catalogue(),
      rulesetId: () => this.metadata?.game?.rulesetId,
      provisional: () => this.metadata?.provisional === true,
      retainFaction: (factionId) =>
        this.retainFactionCapture(factionId, { provisional: this.metadata?.provisional === true }),
      refreshViews: () => this.refreshViews(),
      dealt: () => this.directory.soon(),
      waitUntil: (work) => this.ctx.waitUntil(work),
    });
    if (!this.closed && this.metadata) {
      if (this.metadata.confirmed && this.session.pendingDirectory()) {
        this.directory.soon();
      }
      if (this.session.needsFixtureDeck) {
        this.ctx.waitUntil(this.adoptFixtureDeck().catch((error) => this.diagnostics.report('fixture-deck', error)));
      }
      this.draft.changed();
    }
    try {
      this.restoreConnections();
    } catch (error) {
      this.diagnostics.report('load', error);
      this.connections.clear();
      for (const socket of this.ctx.getWebSockets()) {
        socket.close(1012, 'Reconnect to the table.');
      }
    }
  }

  /*
   * A room that wakes from hibernation finds its players' sockets still open, each with what its connection remembered.
   * A socket with nothing remembered (its attachment failed, or the room can no longer serve it) closes, so the page reconnects.
   * One still being admitted never meets a wake: its admission keeps the sweep running, which keeps the room awake.
   * A restart while the sweep ran (a deploy or a crash) lost the carries and pointers in flight, so every socket closes
   * and its page reconnects into a new epoch, which drops what it was holding.
   * The delivery baselines are gone, so each connection's next frame is a full view.
   */
  private restoreConnections() {
    const quiet = this.ctx.storage.kv.get(QUIET_KEY) === true;
    const saved = this.ctx.storage.kv.get<SavedSummary>(SUMMARY_KEY);
    if (saved) {
      this.summary.restore(saved);
    }
    const behind = new Set<WebSocket>();
    for (const socket of this.ctx.getWebSockets()) {
      const remembered =
        quiet && !this.closed && this.metadata?.confirmed
          ? (socket.deserializeAttachment() as RememberedConnection | null)
          : null;
      if (!remembered) {
        socket.close(1012, 'Reconnect to the table.');
        continue;
      }
      const { epoch, revision, ...connection } = remembered;
      this.connections.set(socket, openConnection({ ...connection, everAuthorized: true }));
      if (this.session.ready && epoch) {
        this.session.resumeEpoch(epoch);
      }
      if (!this.session.ready || revision !== this.session.revision) {
        behind.add(socket);
      }
    }
    if (!this.connections.size) {
      return;
    }
    this.summary.connections(this.connections.size);
    this.restoreCarryHistory();
    this.reconcileViewers();
    /* Waking can move the game on by itself, as a trading deadline that passed while the room slept does. */
    for (const socket of behind) {
      this.sendView(socket, this.connections.get(socket)!);
    }
  }

  /* A woken room goes on refusing the carry IDs its connections used; history of a connection no longer here is dropped. */
  private restoreCarryHistory() {
    if (!this.session.ready) {
      return;
    }
    const live = new Set([...this.connections.values()].map((connection) => connection.connectionId));
    for (const [key, carryIds] of this.ctx.storage.kv.list<string[]>({ prefix: carryHistoryKey('') })) {
      const connectionId = key.slice(carryHistoryKey('').length);
      if (live.has(connectionId)) {
        this.session.restoreCarryHistory(connectionId, carryIds);
        this.savedCarryHistory.set(connectionId, carryIds.length);
      } else {
        this.ctx.storage.kv.delete(key);
      }
    }
  }

  /* Saves each connection's carry history that grew, as the room goes quiet and may hibernate. */
  private saveCarryHistory() {
    if (!this.session.ready) {
      return;
    }
    for (const { connectionId } of this.connections.values()) {
      const carryIds = this.session.carryHistory(connectionId);
      if (carryIds.length !== (this.savedCarryHistory.get(connectionId) ?? 0)) {
        this.ctx.storage.kv.put(carryHistoryKey(connectionId), carryIds);
        this.savedCarryHistory.set(connectionId, carryIds.length);
      }
    }
  }

  /* Writes each admitted connection's attachment when what it remembers changed. */
  private remember() {
    for (const [socket, connection] of this.connections) {
      if (!connection.everAuthorized) {
        continue;
      }
      const remembered: RememberedConnection = {
        connectionId: connection.connectionId,
        openedAt: connection.openedAt,
        /* A long avatar address would outgrow the attachment; the actor directory keeps it. */
        viewer: connection.viewer && { ...connection.viewer, avatarUrl: undefined },
        seatLimitReached: connection.seatLimitReached,
        pass: connection.pass,
        expiryAnnounced: connection.expiryAnnounced,
        sessionId: connection.sessionId,
        announced: connection.announced,
        suspensions: connection.suspensions,
        ...(this.session.ready ? { epoch: this.session.epoch, revision: this.session.revision } : {}),
      };
      const written = JSON.stringify(remembered);
      if (this.remembered.get(socket) === written) {
        continue;
      }
      this.remembered.set(socket, written);
      try {
        socket.serializeAttachment(remembered);
      } catch (error) {
        /* Such a connection still plays; only a wake from hibernation closes it for a reconnect. */
        socket.serializeAttachment(null);
        this.diagnostics.report('socket-attachment', error);
      }
    }
  }

  /*
   * The hosted fixture deals a real treachery deck from the catalogue when the catalogue can supply
   * it, through the same capture the shared inventory spawns from. A catalogue that cannot (the
   * native peer, a backend without the deck) leaves the fixture's placeholder cards in place.
   */
  private async captureFixtureDeck(): Promise<StoredSpawnContents | undefined> {
    try {
      const deck = await this.catalogue().capture(FIXTURE_TREACHERY_DECK);
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
    const capture = await this.catalogue().captureRuleset(rulesetId);
    return this.session.retainRuleset(capture, options);
  }

  protected async retainFactionCapture(factionId: string, options: { provisional?: boolean } = {}) {
    const existing = this.session.retainedFaction(factionId);
    if (existing) {
      return existing;
    }
    const capture = await this.catalogue().captureFaction(factionId);
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
    const metadata = this.metadata;
    const handlers: Record<string, () => Promise<Response>> = {
      'account-deletion': () => this.receiveAccountDeletion(request, metadata),
      'session-cutoff': () => this.receiveSessionCutoff(request, metadata),
      reports: () => this.receiveBugReport(request, gameId!),
    };
    const handle = handlers[operation!];
    if (handle) {
      return handle();
    }
    return this.openSocket(request);
  }

  private async receiveBugReport(request: Request, gameId: string): Promise<Response> {
    if (!isBugReportRequest(request, this.env.APPLICATION_ORIGIN)) {
      return refused();
    }
    if (this.closed || !this.session.ready) {
      return refused();
    }
    if (this.metadata?.gameId !== gameId) {
      return refused();
    }
    const input = await readRequest(request, bugReportRequestSchema, 2 * 1024 * 1024);
    if (!input) {
      return json({ error: 'Describe the problem and keep the report under 2 MB.' }, 400);
    }
    try {
      const pass = await this.authorizeBugReport(gameId, input.pass);
      if (!pass) {
        return refused();
      }
      return await this.dispatchBugReport(gameId, input, pass);
    } catch {
      return json({ error: 'Bug reporting is temporarily unavailable. Try again.' }, 503);
    }
  }

  private async authorizeBugReport(gameId: string, raw: string): Promise<SeatPassPayload | null> {
    const secret = this.metadata!.secret;
    const verified = await this.seatPasses().check(secret, gameId, raw);
    if (!verified.ok) {
      return null;
    }
    const authorization = await this.convex().query(api.playBugReports.authorize, { gameId, secret, pass: raw });
    if (!authorization) {
      return null;
    }
    return Date.now() < authorization.authExpiresAt ? verified.pass : null;
  }

  private async dispatchBugReport(gameId: string, input: BugReportRequest, pass: SeatPassPayload) {
    const reports = this.env.BUG_REPORTS.getByName(pass.principalId);
    if (input.operation === 'status') {
      const progress = await reports.progress(input.requestId, gameId);
      return progress ? json(progress) : json({ error: 'This report was not found.' }, 404);
    }
    const result = await reports.submit({
      requestId: input.requestId,
      description: input.description,
      browser: input.browser,
      gameId,
      actorId: pass.actorId,
      displayName: pass.displayName,
    });
    return json(result.progress ?? { error: result.error }, result.status);
  }

  /** Only the Worker's report coordinator can invoke this RPC; no public route accepts an export request. */
  captureBugReport(requestId: string, actorId: string, displayName: string, browser: BugReportBrowser) {
    if (this.closed) {
      throw new Error('The game state is unavailable.');
    }
    if (!this.session.ready || !this.metadata?.confirmed) {
      throw new Error('The game state is unavailable.');
    }
    bugReportIdSchema.parse(requestId);
    this.session.recordBugReport(requestId, actorId, displayName);
    this.announceBugReportLog();
    return JSON.stringify({
      server: bugReportExport(this.session, {
        gameId: this.metadata.gameId,
        gitSha: this.env.GIT_SHA,
        versionId: this.env.CF_VERSION_METADATA.id,
      }),
      browser: this.session.bugReportBrowser(browser),
    });
  }

  finishBugReport(requestId: string, actorId: string, displayName: string, issueUrl: string) {
    if (this.closed || !this.session.ready) {
      throw new Error('The game is unavailable.');
    }
    bugReportIdSchema.parse(requestId);
    if (!/^https:\/\/github\.com\/ndelangen\/dunezone\/issues\/\d+$/u.test(issueUrl)) {
      throw new Error('Invalid report issue.');
    }
    this.session.recordBugReport(requestId, actorId, displayName, issueUrl);
    this.announceBugReportLog();
  }

  private announceBugReportLog() {
    for (const [socket] of this.connections) {
      this.send(socket, {
        type: 'log-history',
        tab: 'game',
        before: Number.MAX_SAFE_INTEGER,
        ...this.session.logPage('game', Number.MAX_SAFE_INTEGER),
      });
    }
  }

  private async provision(request: Request, gameId: string): Promise<Response> {
    const args = await readRequest(request, playProvisionRequestSchema);
    if (!args) {
      return refused();
    }
    try {
      if (args.gameId !== gameId || this.metadata) {
        return refused();
      }
      const raw: unknown = await this.convex().mutation(api.playProvisioning.validateProvisioning, args);
      const validation = playProvisioningValidationSchema.parse(raw);
      if (!validation.ok) {
        return refused();
      }
      this.requireLocalTestOverrides(validation);
      if (!(await this.retainProvisionedRuleset(args, validation))) {
        return refused();
      }
      const factions =
        'game' in validation && !this.metadata ? await this.draft.factions(validation.game.rulesetId) : null;
      /* The hosted fixture asks the catalogue for its deck before it exists; a refusal costs nothing, a slow answer only time. */
      const fixtureDeck =
        'fixtureKey' in validation && this.fixturePlan.hosted && !this.metadata
          ? await this.captureFixtureDeck()
          : undefined;
      if (!this.initializeValidated(args, validation, factions, fixtureDeck)) {
        return refused();
      }
      if ('game' in validation && validation.testStartStage === 'play') {
        await provisionThroughSetup(validation.game, {
          session: this.session,
          advanceDeadlines: () => this.advanceDeadlines(),
          settleDraft: () => this.draft.settle(),
        });
      }
      await this.confirmProvisioning();
      return this.metadata!.confirmed ? json({ ok: true }) : refused();
    } catch (error) {
      this.diagnostics.report('provision', error);
      return refused();
    }
  }

  /* Fail closed: a game without the real phase cooldown, or provisioned past drafting, exists only in the isolated local stack. */
  private requireLocalTestOverrides(validation: ProvisioningValidation) {
    if (
      (validation.testPhaseCooldownMs !== undefined || validation.testStartStage !== undefined) &&
      !isLocalIsolatedRuntime(this.env)
    ) {
      throw new Error('A test phase cooldown or start stage is refused outside the isolated local runtime.');
    }
  }

  /**
   * A real game retains its ruleset before it exists, and a ruleset that is not ready never becomes a game.
   * False when the ruleset was refused, after the refusal is reported unless another request already provisioned the room.
   */
  private async retainProvisionedRuleset(args: ProvisionArgs, validation: ProvisioningValidation): Promise<boolean> {
    if (!('game' in validation) || this.metadata) {
      return true;
    }
    try {
      await this.retainRulesetCapture(validation.game.rulesetId, { provisional: validation.provisional === true });
      return true;
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      if (!this.metadata) {
        await this.convex().mutation(api.playProvisioning.failProvisioning, {
          ...args,
          reason: error.message,
        });
      }
      return false;
    }
  }

  private initializeValidated(
    args: ProvisionArgs,
    validation: ProvisioningValidation,
    factions: DraftFaction[] | null,
    fixtureDeck?: StoredSpawnContents
  ): boolean {
    // Another request can finish while Convex validates this one and the ruleset is captured. Keep the guard and initialization synchronous.
    if (this.metadata) {
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
    this.draft.changed();
    return true;
  }

  protected retainedCaptures() {
    return this.session.retainedCaptures();
  }
  /** Settles seat changes, then sends every connection its view of the result. */
  private refreshViews() {
    this.reconcileViewers();
    for (const [socket, connection] of this.connections) {
      this.sendView(socket, connection);
    }
  }
  private advanceDeadlines() {
    if (this.session.advanceDeadlines()) {
      this.directory.soon();
      this.refreshViews();
    }
  }
  private deleteActor(userId: string, eventId?: string) {
    this.session.deleteActor(userId, eventId);
    this.directory.soon();
    for (const [socket, connection] of this.connections) {
      if (connection.viewer?.userId === userId) {
        this.deny(socket, false);
      }
    }
    this.refreshViews();
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
    const args = await readRequest(request, playRetireFixtureRequestSchema);
    if (args?.gameId !== gameId) {
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
    if (!this.retiresAs(metadata, gameId, args.secret)) {
      return refused();
    }
    try {
      if (!this.closed) {
        for (const socket of this.connections.keys()) {
          this.disconnect(socket, false);
        }
        this.stopTimers();
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

  /**
   * Only the hosted fixture's own room, or a room Convex never confirmed, retires, and only for the secret it was provisioned with.
   * Convex asks an unconfirmed room only once its game expired, when no confirmation can succeed any more.
   */
  private retiresAs(metadata: Metadata, gameId: string, secret: string) {
    return (
      metadata.gameId === gameId &&
      credentialsMatch(secret, metadata.secret) &&
      (!metadata.confirmed || (!metadata.game && this.fixturePlan.hosted))
    );
  }

  private async receiveAccountDeletion(request: Request, metadata: Metadata): Promise<Response> {
    const args = await readRequest(request, playAccountDeletionRequestSchema);
    if (!args) {
      return refused();
    }
    try {
      if (args.gameId !== metadata.gameId || !credentialsMatch(args.secret, metadata.secret)) {
        return refused();
      }
      this.deleteActor(args.userId, args.eventId);
      const raw: unknown = await this.convex().mutation(api.playAdmission.ackAccountDeletion, {
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

  private seatPasses() {
    this.passes ??= new SeatPasses(this.ctx.storage.sql);
    return this.passes;
  }

  /** Stores the cutoff, ends every connection it revokes, then acknowledges the cutoff now held, so a lost answer is retried, never lost. */
  private async receiveSessionCutoff(request: Request, metadata: Metadata): Promise<Response> {
    const args = await readRequest(request, playSessionCutoffRequestSchema);
    if (!args) {
      return refused();
    }
    try {
      if (args.gameId !== metadata.gameId || !credentialsMatch(args.secret, metadata.secret)) {
        return refused();
      }
      const through = this.seatPasses().raise(args.principalId, args.through);
      this.authorizationChanged();
      const raw: unknown = await this.convex().mutation(api.playSessionCutoffs.ackSessionCutoff, {
        gameId: metadata.gameId,
        secret: metadata.secret,
        eventId: args.eventId,
        through,
      });
      return raw === null ? json({ ok: true }) : refused();
    } catch (error) {
      this.diagnostics.report('session-cutoff', error);
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
    this.connections.set(server, openConnection({ connectionId: crypto.randomUUID(), openedAt: Date.now() }));
    this.summary.connections(this.connections.size);
    this.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async alarm() {
    /* The alarm that fired is no longer stored. */
    this.alarmAt = undefined;
    if (this.loadFailure !== undefined && !this.retired) {
      /* A failed alarm is retried a few times, so a deadline outlives a brief load failure. */
      throw this.loadFailure;
    }
    if (this.closed) {
      return;
    }
    if (this.metadata?.confirmed) {
      this.advanceDeadlines();
      if (this.connections.size) {
        this.authorizationChanged();
      }
      this.remember();
      await this.directory.deliver();
      /* What the wake sent and called waits in the summary, which a running sweep writes; a quiet room saves it again. */
      if (!this.sweepTimer && this.summary.pending(this.counters())) {
        this.rest();
      }
    } else {
      await this.confirmProvisioning();
    }
  }

  /*
   * One alarm serves the battle deadline, the directory retry and, while the sweep is stopped, the next
   * seat pass to expire: whichever is due first. A pass whose session ended cannot be renewed, so the
   * alarm wakes a sleeping room to pause that table, as the sweep does in a busy one.
   * Only a change reaches storage, so a command that leaves the deadlines alone writes no alarm.
   */
  private scheduleAlarm() {
    if (this.closed) {
      return Promise.resolve();
    }
    const due = [this.session.nextDeadline(), this.sweepTimer ? undefined : this.nextPassExpiry()].filter(
      (time) => time !== undefined
    );
    const at = due.length ? Math.min(...due) : null;
    if (at === this.alarmAt) {
      return Promise.resolve();
    }
    this.alarmAt = at;
    return (at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at)).catch((error: unknown) => {
      /* A write that failed leaves the stored alarm unknown, so the next schedule writes again. */
      this.alarmAt = undefined;
      throw error;
    });
  }

  private nextPassExpiry() {
    const now = Date.now();
    let next: number | undefined;
    for (const connection of this.connections.values()) {
      const exp = connection.pass?.exp;
      if (exp !== undefined && exp > now && (next === undefined || exp < next)) {
        next = exp;
      }
    }
    return next;
  }

  private async confirmProvisioning() {
    const metadata = this.metadata;
    if (!metadata || metadata.confirmed) {
      return;
    }
    const epoch = ++this.confirmationEpoch;
    const startedAt = Date.now();
    /* Recovery stays durable while the request is pending, including when it crosses expiry. */
    this.alarmAt = undefined;
    await this.ctx.storage.setAlarm(
      startedAt + (startedAt < metadata.expiresAt ? PLAY_CONFIRMATION_RETRY_MS : PLAY_CONFIRMATION_RECOVERY_MS)
    );
    try {
      const raw: unknown = await this.convex().mutation(api.playProvisioning.confirmProvisioning, {
        gameId: metadata.gameId,
        secret: metadata.secret,
        attemptId: metadata.attemptId,
      });
      if (epoch !== this.confirmationEpoch) {
        return;
      }
      if (playConfirmationSchema.parse(raw).ok) {
        this.session.confirm();
      }
      await this.ctx.storage.deleteAlarm();
      this.alarmAt = null;
      /* The opening summary waited for confirmation: only a confirmed game is listed. */
      this.directory.soon();
      this.diagnostics.recovered('confirmation');
    } catch (error) {
      /* A superseded attempt still reports, so a first request that outlives its alarm stays visible. */
      this.diagnostics.report('confirmation', error, { durationMs: Date.now() - startedAt });
      /* The pre-armed alarm retries the acknowledgement without reinitializing the game. */
    }
  }

  /** Whether any admitted connection of this user reported them at the seat limit; a user with no connection here is not. */
  private atSeatLimit(userId: string) {
    for (const connection of this.connections.values()) {
      if (connection.viewer?.userId === userId && connection.seatLimitReached) {
        return true;
      }
    }
    return false;
  }

  private pendingConnection(socket: WebSocket, connection: Connection) {
    return this.connections.get(socket) === connection && Date.now() < connection.openedAt + PLAY_PENDING_TIMEOUT_MS;
  }

  private canAdmit(socket: WebSocket, connection: Connection) {
    if (connection.admitting || connection.viewer) {
      this.refuseAdmission(socket, 'duplicate');
      return false;
    }
    return true;
  }

  private async admit(socket: WebSocket, connection: Connection, request: Extract<ClientMessage, { type: 'admit' }>) {
    if (!this.canAdmit(socket, connection)) {
      return;
    }
    connection.admitting = true;
    connection.replaces = request.replaces;
    await this.admitWithPass(socket, connection, request.pass);
  }

  /*
   * A pass is checked by the room alone: its signature against the game's secret, its deadline against the room's clock, and its session against the cutoffs Convex pushed.
   * An expired pass closes without a refusal, so the page fetches a fresh one and reconnects.
   */
  private async admitWithPass(socket: WebSocket, connection: Connection, raw: string) {
    const metadata = this.metadata!;
    const checked = await this.seatPasses().check(metadata.secret, metadata.gameId, raw);
    if (!this.pendingConnection(socket, connection)) {
      this.expirePending(socket);
      return;
    }
    if (!checked.ok) {
      if (checked.reason === 'expired') {
        this.disconnect(socket);
        socket.close(PASS_EXPIRED_CLOSE_CODE, 'Seat pass expired.');
        return;
      }
      this.refuseAdmission(socket, 'pass');
      return;
    }
    const { pass } = checked;
    connection.viewer = {
      connectionId: connection.connectionId,
      userId: pass.actorId,
      viewerSeat: SPECTATOR_SEAT,
      displayName: pass.displayName.slice(0, 160),
      color: SPECTATOR_COLOR,
    };
    connection.avatarUrl = pass.avatarUrl;
    connection.profileSlug = pass.profileSlug;
    connection.sessionId = pass.sessionId;
    connection.pass = heldPass(pass);
    /* Unknown reads as at the limit, so a seat request waits for the answer rather than slipping past it. */
    connection.seatLimitReached = true;
    void this.readSeatLimit(connection);
    this.authorizationChanged();
  }

  /** A fresher pass for an admitted connection: it must name the same game, account and actor, and may arrive after the old one expired. */
  private async renewPass(socket: WebSocket, connection: Connection, raw: string) {
    const metadata = this.metadata!;
    const checked = await this.seatPasses().check(metadata.secret, metadata.gameId, raw);
    const held = connection.pass;
    if (!held || this.connections.get(socket) !== connection) {
      return;
    }
    if (!checked.ok || checked.pass.principalId !== held.principalId) {
      /* An expired renewal is ignored; the page fetches another. Anything else is a page this room no longer trusts. */
      if (checked.ok || checked.reason !== 'expired') {
        this.refuseAdmission(socket, 'pass');
      }
      return;
    }
    if (checked.pass.actorId !== held.actorId) {
      /* The same account now plays as another actor, as after a merge: the page reconnects with the new pass and takes that actor's seat. */
      this.disconnect(socket);
      socket.close(SEAT_CHANGED_CLOSE_CODE, 'Seat changed.');
      return;
    }
    connection.pass = heldPass(checked.pass);
    connection.sessionId = checked.pass.sessionId;
    this.authorizationChanged();
  }

  /* Asked once per admission; a failed read retries a few times and otherwise keeps the connection at the limit. */
  private async readSeatLimit(connection: Connection, attempt = 0) {
    const metadata = this.metadata!;
    try {
      const raw: unknown = await this.convex().query(api.playAdmission.seatLimitReached, {
        gameId: metadata.gameId,
        secret: metadata.secret,
        userId: connection.viewer!.userId,
      });
      const result = playSeatLimitResultSchema.parse(raw);
      if (result.ok) {
        connection.seatLimitReached = result.reached;
        this.remember();
        return;
      }
    } catch (error) {
      this.diagnostics.report('seat-limit', error);
    }
    if (attempt < 4 && [...this.connections.values()].includes(connection)) {
      setTimeout(() => void this.readSeatLimit(connection, attempt + 1), PLAY_AUTH_RECOVERY_MS * 4 ** attempt);
    }
  }

  private refuseAdmission(socket: WebSocket, reason: AdmissionRefusal) {
    this.diagnostics.refused(reason);
    this.deny(socket);
  }

  /** Whether the connection's pass stands and, once admitted, it still holds the seat it was given. */
  private authorized(socket: WebSocket): boolean {
    const connection = this.connections.get(socket);
    if (!connection?.viewer) {
      return false;
    }
    const allowed = connection.pass !== undefined && this.seatPasses().current(connection.pass);
    if (allowed && connection.everAuthorized) {
      const seat = this.session.seatFor(connection.viewer.userId);
      if (!seat || seat !== connection.viewer.viewerSeat) {
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
      this.sendAfterAdmission(admitted);
    } else if (activityChanged || this.session.revision !== revision) {
      this.broadcastActivity();
    }
    this.remember();
  }

  /** A newly admitted connection receives a full view, and every other one the update its seating made. */
  private sendAfterAdmission(admitted: ReadonlySet<WebSocket>) {
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
  }

  /* A revoked pass ends the connection; an expired one holds it until the page sends a fresh pass. */
  private updateConnectionAuthorization(socket: WebSocket, connection: Connection) {
    const pass = connection.pass;
    if (!pass) {
      return;
    }
    if (this.seatPasses().revoked(pass)) {
      this.deny(socket, false);
      return 'activity';
    }
    if (this.authorized(socket)) {
      return connection.announced === 'authorized' ? undefined : this.announceAuthorized(socket, connection);
    }
    if (this.seatPasses().current(pass)) {
      return this.suspend(socket, connection, 'suspended');
    }
    /* A connection already suspended for its seat still hears once that its pass ran out, so the page renews it. */
    if (connection.announced === 'suspended' && connection.expiryAnnounced !== pass.exp) {
      this.sendAdmission(socket, 'pass-expired');
    }
    connection.expiryAnnounced = pass.exp;
    return this.suspend(socket, connection, 'pass-expired');
  }

  private suspend(socket: WebSocket, connection: Connection, status: 'suspended' | 'pass-expired') {
    if (connection.announced !== 'suspended') {
      connection.announced = 'suspended';
      connection.suspensions++;
      this.session.clearActivity(connection.connectionId);
      this.sendAdmission(socket, status);
      return connection.everAuthorized ? 'activity' : undefined;
    }
  }

  /** An authorized connection not yet announced as such takes its seat; one the room can no longer seat is denied. */
  private announceAuthorized(socket: WebSocket, connection: Connection) {
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
    this.retireReplaced(connection);
    return 'admitted';
  }

  /*
   * A network that died without a close frame leaves the page's old connection here, still holding its carry for up to 8 s and its pointer for up to 3 s.
   * The reconnected page would see its own piece held by another player, so the old connection of the same user closes as soon as the new one is admitted.
   * Only the connection the page names is closed, so another live tab of the same player keeps its carry.
   * The admission that calls this sends every other viewer a frame, which carries the removed activity.
   */
  private retireReplaced(connection: Connection) {
    const replaces = connection.replaces;
    connection.replaces = undefined;
    if (!replaces || replaces === connection.connectionId) {
      return;
    }
    for (const [socket, previous] of this.connections) {
      if (previous.connectionId === replaces && previous.viewer?.userId === connection.viewer!.userId) {
        this.disconnect(socket, false);
        socket.close(1000, 'Replaced by a newer connection.');
        return;
      }
    }
  }

  override async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    try {
      await this.receive(socket, input);
    } finally {
      this.remember();
    }
  }

  private async receive(socket: WebSocket, input: string | ArrayBuffer) {
    if (this.closed) {
      socket.close(1000, 'This table is closed.');
      return;
    }
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    this.summary.message();
    this.ensureSweep();
    const message = this.readMessage(socket, connection, input);
    if (!message) {
      return;
    }
    if (message.type === 'admit') {
      await this.admit(socket, connection, message);
      return;
    }
    if (message.type === 'pass') {
      await this.renewPass(socket, connection, message.pass);
      return;
    }
    if (this.receiveUnsaved(socket, connection, message)) {
      return;
    }
    if (this.reconcileViewers()) {
      this.broadcastActivity();
    }
    const suspensions = connection.suspensions;
    if (!this.mayAct(socket, connection, suspensions)) {
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
      this.rejectMessage(socket, connection, message, error);
      if (error instanceof CarryHistoryExhausted) {
        /* A connection that used every carry ID the room remembers can pick nothing up again, so the browser is sent to reconnect, as after a restart. */
        this.disconnect(socket);
        socket.close(1012, 'Reconnect to the table.');
      }
    }
  }

  /* Motion and telemetry are never saved, so they skip every upkeep a command needs; true when the message was one of them. */
  private receiveUnsaved(
    socket: WebSocket,
    connection: Connection,
    message: ClientMessage
  ): message is Extract<ClientMessage, { type: 'telemetry' | 'pointer' | 'pose' }> {
    if (message.type === 'telemetry') {
      this.receiveTelemetry(connection, message);
      return true;
    }
    if (message.type === 'pointer' || message.type === 'pose') {
      this.receiveMotion(socket, connection, message);
      return true;
    }
    return false;
  }

  /* A browser's account of how the table felt is only logged. */
  private receiveTelemetry(connection: Connection, message: Extract<ClientMessage, { type: 'telemetry' }>) {
    if (connection.viewer) {
      this.summary.client(connection.connectionId, message);
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
   * A ping goes straight out to every other connection at the table and is kept nowhere, so a reconnecting page never sees an old one.
   * A spectator has no cursor to ping from, and a ping sooner than the interval after the last is dropped, as a page that keeps to it never sends one.
   */
  private relayPing(socket: WebSocket, connection: Connection, message: Extract<ClientMessage, { type: 'ping' }>) {
    const viewer = connection.viewer!;
    const now = Date.now();
    if (viewer.viewerSeat === SPECTATOR_SEAT || now - connection.pingedAt < TABLE_PING_INTERVAL_MS) {
      return;
    }
    connection.pingedAt = now;
    const sound = pingSoundAllowed(connection, message.sound, now);
    const { connectionId, viewerSeat, displayName, color } = viewer;
    const ping = {
      connectionId,
      viewerSeat,
      displayName,
      color,
      position: message.position,
      ...(sound && { sound }),
    };
    for (const [peer, other] of this.connections) {
      if (peer !== socket && other.viewer) {
        this.send(peer, { type: 'ping', ping });
      }
    }
  }

  /*
   * Whether the connection may still act on a message that arrived after `suspensions` pauses, checked again after any catalogue read.
   * A pause since then drops the message, even when the connection was admitted again, because the page discarded its unanswered requests on the pause.
   */
  private mayAct(socket: WebSocket, connection: Connection, suspensions: number) {
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
    const catalogue = this.catalogue();
    try {
      const contents = this.session.projectContents(await catalogue.capture(message.selection));
      if (this.mayAct(socket, connection, suspensions)) {
        this.send(socket, { type: 'catalogue', requestId: message.requestId, contents });
      }
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      if (this.mayAct(socket, connection, suspensions)) {
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
    if (this.session.alreadyCommitted(connection.viewer!, message)) {
      this.sendView(socket, connection, message.commandId);
      return;
    }
    const contents = await this.catalogue().capture(message.action);
    /* Catalogue I/O yields, so the request is checked again like a new message. Commit rechecks authorization, the roster and the receipt afterward. */
    if (this.mayAct(socket, connection, suspensions)) {
      this.commit(socket, connection, message, contents);
    }
  }

  private readMessage(
    socket: WebSocket,
    connection: Connection,
    input: string | ArrayBuffer
  ): ClientMessage | undefined {
    if (typeof input !== 'string' || input.length > CLIENT_MESSAGE_LIMIT) {
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
    const elapsed = Math.max(0, now - connection.refilledAt);
    const refill = (tokens: number) => Math.min(RATE_BURST, tokens + (elapsed * RATE_PER_SECOND) / 1000);
    connection.tokens = refill(connection.tokens);
    connection.motionTokens = refill(connection.motionTokens);
    connection.commandTokens = Math.min(
      COMMAND_BURST,
      connection.commandTokens + (elapsed * COMMANDS_PER_SECOND) / 1000
    );
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
      return this.withinCommandBudget(socket, connection, message);
    }
    this.refuseRate(socket);
  }

  /* A table command past its own bucket is refused on its own: the socket stays open, and the room spends no write or frame on it. */
  private withinCommandBudget(socket: WebSocket, connection: Connection, message: ClientMessage) {
    if (message.type !== 'command') {
      return message;
    }
    if (connection.commandTokens < 1) {
      this.send(socket, { type: 'rejected', requestId: message.commandId, message: COMMAND_RATE_REFUSAL });
      return;
    }
    connection.commandTokens--;
    return message;
  }

  private refuseRate(socket: WebSocket) {
    this.disconnect(socket);
    socket.close(RATE_LIMITED_CLOSE_CODE, 'Too many requests.');
  }

  /* Reads that answer from the room's records alone, whatever the reader may do at the table. */
  private sendPage(socket: WebSocket, message: PageRead) {
    switch (message.type) {
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
      case 'faction':
        this.send(socket, {
          type: 'faction',
          factionId: message.factionId,
          faction: this.session.publicFaction(message.factionId),
        });
        return;
    }
  }

  private dispatch(
    socket: WebSocket,
    connection: Connection,
    message: Exclude<ClientMessage, { type: 'admit' | 'pass' | 'catalogue' | 'pointer' | 'pose' | 'telemetry' }>
  ) {
    if (isPageRead(message)) {
      this.sendPage(socket, message);
      return;
    }
    switch (message.type) {
      case 'sync':
        this.sendView(socket, connection);
        return;
      case 'conversation-history':
      case 'conversation-send':
      case 'conversation-read':
        this.handleConversation(socket, connection.viewer!, message);
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
      if (saved.inserted) {
        this.publishConversationMessage(request, saved.message);
        this.directory.soon();
      } else {
        /* A retried request was already delivered to every member; only the retrying connection needs its confirmation. */
        this.send(socket, {
          type: 'conversation-message',
          factionId: request.factionId,
          peerId: request.peerId,
          message: saved.message,
        });
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
    const members = this.session.conversationMembers(request);
    /* Only current members receive the saved message, including the sender's other connections. */
    for (const [peer, identity] of this.connections) {
      if (!identity.viewer || !this.authorized(peer)) {
        continue;
      }
      const own = this.session.conversationFaction(identity.viewer);
      if (own && members.includes(own)) {
        this.send(peer, {
          type: 'conversation-message',
          factionId: own,
          peerId: conversationPeerFor(own, faction, request.peerId),
          message,
        });
        this.sendConversations(peer, identity.viewer);
      }
    }
  }

  /** `ifChanged` holds back summaries the socket already has; a view and every conversation change send them regardless. */
  private sendConversations(socket: WebSocket, viewer: Viewer, ifChanged = false) {
    if (!this.session.ready || !this.authorized(socket)) {
      return;
    }
    const message = this.session.conversationSummaries(viewer);
    if (!message) {
      this.conversationsSent.delete(socket);
      return;
    }
    /* The seat goes with them, because a page clears its summaries whenever its own faction changes. */
    const summaries = JSON.stringify([viewer.viewerSeat, message]);
    if (ifChanged && this.conversationsSent.get(socket) === summaries) {
      return;
    }
    this.conversationsSent.set(socket, summaries);
    this.send(socket, message);
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
    message: Extract<ClientMessage, { type: 'ping' | 'begin' | 'take' | 'flip' | 'renew' | 'cancel' }>
  ) {
    if (message.type === 'ping') {
      this.relayPing(socket, connection, message);
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
      this.diagnostics.report('message', error, { messageType: message.type });
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
  private commit(socket: WebSocket, connection: Connection, message: CommitMessage, contents?: StoredSpawnContents) {
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
        this.draft.changed();
      }
    }
    this.directory.soon();
    this.ctx.waitUntil(this.scheduleAlarm().catch((error) => this.diagnostics.report('battle-alarm', error)));
    this.reconcileViewers();
    this.broadcastCommittedView(connection, message);
    /* Frames sent after a write leave the room once the write is durable, so the confirmation's arrival bounds how long they were held. */
    this.ctx.waitUntil(
      this.ctx.storage
        .sync()
        .then(() => {
          timing.durableAt = Date.now();
          this.summary.command(timing.durableAt - timing.handledAt);
        })
        .catch((error) => this.diagnostics.report('storage-sync', error))
    );
  }

  /** The catalogue this deployment reads factions, rulesets and decks from. */
  private catalogue() {
    return new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN, this.observeConvex);
  }

  private broadcastCommittedView(connection: Connection, message: CommitMessage) {
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
              historySteps: this.session.historySteps,
              ...clock,
            }
          : { ...message, ...clock }
      );
      socket.send(data);
      if (message.type === 'view' || (message.type === 'update' && message.snapshot)) {
        this.sendConversations(socket, this.connections.get(socket)!.viewer!, message.type === 'update');
      }
      this.messagesSent++;
      if (message.type === 'update' && !message.snapshot) {
        this.activityDeliveries++;
      }
      this.bytesSent += Buffer.byteLength(data);
    } catch (error) {
      this.diagnostics.report('socket-send', error);
      this.ctx.waitUntil(Promise.resolve().then(() => this.disconnect(socket)));
    }
  }

  private sendAdmission(socket: WebSocket, status: 'suspended' | 'denied' | 'pass-expired') {
    /* A page that loses its admission drops its summaries, so whatever readmits it receives them again. */
    this.conversationsSent.delete(socket);
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
    clearTimeout(this.activityTimer);
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
    socket.close(ADMISSION_REFUSED_CLOSE_CODE, 'Admission refused.');
  }

  private disconnect(socket: WebSocket, broadcast = true) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }
    this.connections.delete(socket);
    this.session.disconnect(connection.connectionId);
    if (this.savedCarryHistory.delete(connection.connectionId)) {
      this.ctx.storage.kv.delete(carryHistoryKey(connection.connectionId));
    }
    if (!this.connections.size) {
      this.stopTimers();
      this.flushSummary('empty');
    }
    if (broadcast) {
      this.reconcileViewers();
      this.broadcastActivity();
    }
  }

  private stopTimers() {
    this.clearActivityTimer();
    this.stopSweep();
  }

  private stopSweep() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    this.sweepTimer = undefined;
    this.sweptAt = undefined;
    /* The alarm takes over the pass expiries the sweep was watching. */
    this.ctx.waitUntil(this.scheduleAlarm().catch((error) => this.diagnostics.report('battle-alarm', error)));
  }

  /** Stops the room's timers before disconnecting it for teardown. */
  protected stopConnections() {
    this.stopTimers();
    for (const socket of this.ctx.getWebSockets()) {
      this.webSocketClose(socket);
    }
  }

  /*
   * The sweep runs only while something here expires on its own: an admission, a carry or a pointer.
   * A quiet room stops it, and the alarm covers the deadlines, so the room can hibernate while its
   * players think. Every message starts it again.
   */
  private ensureSweep() {
    if (this.sweepTimer) {
      return;
    }
    this.ctx.storage.kv.delete(QUIET_KEY);
    this.sweepTimer = setInterval(() => {
      this.noteStall();
      this.sweepConnections();
      if (this.summary.due(Date.now())) {
        this.flushSummary('interval');
      }
      if (this.needsSweep()) {
        return;
      }
      this.rest();
    }, SWEEP_MS);
  }

  /* Saves what a hibernation would lose, then stops the sweep so the room may sleep. */
  private rest() {
    this.saveCarryHistory();
    if (this.summary.pending(this.counters())) {
      this.ctx.storage.kv.put(SUMMARY_KEY, this.summary.save(this.counters()));
    }
    this.ctx.storage.kv.put(QUIET_KEY, true);
    this.stopSweep();
  }

  /* The native fixture reads this to prove a quiet room stops its sweep. */
  protected get sweeping() {
    return this.sweepTimer !== undefined;
  }

  private needsSweep() {
    return this.session.hasActivity || [...this.connections.values()].some((connection) => !connection.everAuthorized);
  }

  private counters() {
    return {
      motionReceived: this.motionReceived,
      motionForwarded: this.motionForwarded,
      motionDropped: this.motionDropped,
      activityDeliveries: this.activityDeliveries,
      messagesSent: this.messagesSent,
      bytesSent: this.bytesSent,
    };
  }

  private flushSummary(reason: 'interval' | 'empty') {
    this.summary.flush(this.counters(), this.connections.size, reason);
    this.ctx.storage.kv.delete(SUMMARY_KEY);
  }

  private noteStall() {
    const now = Date.now();
    const lateMs = this.sweptAt === undefined ? 0 : now - this.sweptAt - SWEEP_MS;
    this.sweptAt = now;
    if (lateMs > STALL_MS) {
      this.summary.stall(lateMs);
      this.stalls.push({ at: now, lateMs });
      if (this.stalls.length > STALLS) {
        this.stalls.shift();
      }
    }
  }

  private expirePendingConnections() {
    for (const [socket, connection] of this.connections) {
      if (!connection.everAuthorized && Date.now() >= connection.openedAt + PLAY_PENDING_TIMEOUT_MS) {
        this.expirePending(socket);
      }
    }
  }

  private expirePending(socket: WebSocket) {
    this.disconnect(socket);
    socket.close(4408, 'Admission timed out.');
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
  async email(message, env): Promise<void> {
    await forwardPrivacyRequest(message, env);
  },
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin !== env.APPLICATION_ORIGIN || url.search) {
      return refused();
    }
    /* The Node globals in this tsconfig shadow the Workers `caches`, which has `default` at runtime. */
    const markers = (caches as unknown as { default: Cache }).default;
    const alert = await handleAlertWebhook(request, url.pathname, env, { markers });
    if (alert) {
      return alert;
    }
    const service = await gameServiceResponse(request, env);
    if (service) {
      return service;
    }
    if (
      url.pathname === HOMEPAGE_SOCKET_PATH &&
      request.method === 'GET' &&
      isApplicationSocket(request, env.APPLICATION_ORIGIN)
    ) {
      return env.HOMEPAGE_ROOMS.getByName('public-homepage').fetch(request);
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
} satisfies ExportedHandler<GameEnv & Pick<AlertEnv, 'ALERT_EMAIL_TO'>>;
