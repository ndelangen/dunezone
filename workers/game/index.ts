import { DurableObject } from 'cloudflare:workers';
import { makeFunctionReference } from 'convex/server';
import type { z } from 'zod';

import type { playGameProvisionSchema } from '../../src/shared/play/admission';
import {
  PLAY_PENDING_TIMEOUT_MS,
  PLAY_AUTH_LEASE_MS,
  PLAY_AUTH_RECOVERY_MS,
  PLAY_AUTH_RENEWAL_MS,
  PLAY_AUTHORIZATION_BATCH_SIZE,
  PLAY_CONFIRMATION_RETRY_MS,
  PLAY_CONFIRMATION_RECOVERY_MS,
  PLAY_REDEEM_TICKET_FUNCTION,
  PLAY_VALIDATE_PROVISIONING_FUNCTION,
  PLAY_CONFIRM_PROVISIONING_FUNCTION,
  PLAY_FAIL_PROVISIONING_FUNCTION,
  PLAY_RECONCILE_ACCOUNTS_FUNCTION,
  PLAY_ACK_ACCOUNT_DELETION_FUNCTION,
  playProvisionRequestSchema,
  playProvisioningValidationSchema,
  playConfirmationSchema,
  playRedeemTicketResultSchema,
  playAccountDeletionRequestSchema,
  playReconcileAccountsResultSchema,
} from '../../src/shared/play/admission';
import type { SpiceTransfer } from '../../src/shared/play/banks';
import type { CaptureReadiness, ExtraReference } from '../../src/shared/play/capture';
import { emptySnapshot } from '../../src/shared/play/commands';
import {
  PLAY_DIRECTORY_RETRY_CEILING_MS,
  PLAY_DIRECTORY_RETRY_MS,
  PLAY_PUBLISH_SUMMARY_FUNCTION,
  playPublishSummaryResultSchema,
} from '../../src/shared/play/directory';
import type { PlayDirectorySummary } from '../../src/shared/play/directory';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { SpawnContents } from '../../src/shared/play/inventory';
import type { LoadProfile } from '../../src/shared/play/loadFixture';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { clientMessageSchema } from '../../src/shared/play/protocol';
import type { ClientMessage, ServerMessage, Viewer, GameSnapshot } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { TableRoster } from '../../src/shared/play/schema';
import type { RoomFrame } from '../../src/shared/play/updates';
import { ActorDirectory, SPECTATOR_COLOR } from './actors';
import { HISTORY_REPAIR_VERSION } from './anonymizeHistory';
import { AuthorizationWatch, gameHttpClient } from './authorization';
import { expireBattle } from './battle';
import { CaptureStore } from './captures';
import { GameCatalogue } from './catalogue';
import { RoomDelivery } from './delivery';
import { GameDiagnostics } from './diagnostics';
import { DirectoryOutbox } from './directory';
import { fixtureRoster, fixtureSnapshot, legacyFixtureRoster, seedFactionState } from './fixture';
import { applyPatch, diff } from './history';
import type { Patch } from './history';
import { Room } from './room';
import { SpiceLedger } from './spiceLedger';
import { RoomProjection, storedSnapshotSchema } from './state';
import type { StoredSnapshot } from './state';

/** The seat a real game's creator holds from creation. */
const CREATOR_SEAT = 'seat-1';

/** The opening table records who holds the first seat, so the log starts with the seating and not after it. */
function creatorSeated(snapshot: GameSnapshot, roster: TableRoster, displayName: string): GameSnapshot {
  const events = [
    ...snapshot.table.events,
    { id: 'evt-002', command: 'seat', message: `${displayName} holds seat 1.`, status: 'accepted' as const },
  ];
  return {
    ...snapshot,
    roster,
    table: { ...snapshot.table, events, nextEventNumber: snapshot.table.nextEventNumber + 1 },
  };
}

type Metadata = {
  gameId: string;
  secret: string;
  attemptId: string;
  expiresAt: number;
  confirmed: boolean;
  loadProfile?: LoadProfile;
  /* Stations around the rim, fixed when the seating is. A room from before this field reads its fixture plan. */
  seatCount?: TableRoster['seatCount'];
  /* A real game's fixed ruleset, minimum and creator; absent on a fixture. */
  game?: z.infer<typeof playGameProvisionSchema>;
  /* The scrub release this room's history is repaired to: stamped at creation, or committed with a startup repair. */
  historyRepair?: number;
};
type Connection = {
  connectionId: string;
  openedAt: number;
  admitting: boolean;
  /* One catalogue capture per connection at a time; a capture is up to hundreds of sequential Convex queries. */
  capturing: boolean;
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
  private readonly spiceLedger: SpiceLedger;
  private readonly directory: DirectoryOutbox;
  private directoryDelivery?: Promise<void>;
  private readonly captures: CaptureStore;
  protected readonly diagnostics: GameDiagnostics;
  private metadata: Metadata | undefined;
  private confirmationEpoch = 0;
  private room: Room | undefined;
  private boundary: StoredSnapshot | undefined;
  private historyStep = 0;
  private readonly connections = new Map<WebSocket, Connection>();
  private authorization: AuthorizationWatch | undefined;
  private readonly delivery = new RoomDelivery();
  private roomProjection?: RoomProjection;
  private get projection() {
    this.roomProjection ??= new RoomProjection(this.metadata!.secret);
    return this.roomProjection;
  }
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

  constructor(ctx: DurableObjectState, env: GameEnv) {
    super(ctx, env);
    this.diagnostics = new GameDiagnostics(ctx.id.toString(), env.GIT_SHA);
    this.actors = new ActorDirectory(ctx.storage);
    this.spiceLedger = new SpiceLedger(ctx.storage);
    this.directory = new DirectoryOutbox(ctx.storage);
    this.captures = new CaptureStore(ctx.storage);
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
    sql.exec(
      'CREATE TABLE IF NOT EXISTS public_action_history (receipt_key TEXT PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, action TEXT NOT NULL, contents TEXT, created_at INTEGER NOT NULL)'
    );
    sql.exec('CREATE TABLE IF NOT EXISTS battle_results (revision INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS deletion_receipts (event_id TEXT PRIMARY KEY)');
    /*
     * Server-side only: which account filed a spawn request, so history replay can mask a deleted
     * requester, and the captured definitions the live snapshot omits, so approval and dismissal
     * audit rows still carry the full contents.
     */
    sql.exec(
      'CREATE TABLE IF NOT EXISTS spawn_requests (request_id TEXT PRIMARY KEY, user_id TEXT, definitions TEXT NOT NULL)'
    );
    /*
     * The seating a game fixed: one row per seat with its station and the faction it carries.
     * A room provisioned before this table existed carried the fixture pair in `faction_seats`;
     * it receives its fixture plan once, and that older table stays in place unread so an earlier
     * release can still start against the same storage.
     */
    sql.exec(
      'CREATE TABLE IF NOT EXISTS seats (seat TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE, faction_id TEXT UNIQUE, faction_name TEXT, faction_color TEXT)'
    );
    const metadata = sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').toArray()[0];
    if (metadata) {
      this.metadata = JSON.parse(metadata.data) as Metadata;
      this.installLegacySeating();
      /* A room that wakes owing a summary delivers it, whether or not a player ever connects. */
      if (this.metadata.confirmed && this.directory.pending()) {
        this.deliverDirectorySoon();
      }
      this.repairDeletedHistory();
      const stored = sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
      this.room = this.openRoom(
        this.withRoster(this.spiceLedger.project(storedSnapshotSchema.parse(JSON.parse(stored.data))))
      );
      this.historyStep = sql.exec<{ step: number }>('SELECT MAX(step) AS step FROM history').one().step;
      this.boundary = this.restoreHistory(this.historyStep);
    }
    /* A restored attachment or SQLite row is not an auth grant. Each tab redeems a fresh ticket. */
    for (const socket of ctx.getWebSockets()) {
      socket.close(1012, 'Reconnect to the table.');
    }
  }

  /*
   * Deletion scrubs history inside its own transaction, so startup repairs only rows an older scrub release left.
   * The version commits with the rewrite; a failed rewrite keeps the old version and the next start repairs again.
   * In the constructor workerd discards every write of a throwing start anyway; the transaction keeps the method
   * safe should it ever run from a request.
   */
  private repairDeletedHistory() {
    const metadata = this.metadata!;
    if (metadata.historyRepair === HISTORY_REPAIR_VERSION) {
      return;
    }
    this.ctx.storage.transactionSync(() => {
      this.actors.scrubDeletedHistory();
      this.ctx.storage.sql.exec(
        "UPDATE metadata SET data=json_set(data, '$.historyRepair', ?) WHERE id=1",
        HISTORY_REPAIR_VERSION
      );
    });
    this.reloadMetadata();
  }

  private reloadMetadata() {
    const { data } = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM metadata WHERE id=1').one();
    /* An in-flight confirmation holds this same object and must not write an old creator name back. */
    Object.assign(this.metadata!, JSON.parse(data) as Metadata);
  }

  /*
   * A room from before this release has no seats and no stored station count. It carried its
   * faction-to-seat mapping in `faction_seats` if it ever started under the previous release;
   * either way it is seated once from what it has, and its snapshot gains a bank and combat faces
   * for any house it lacks. A room from this release onward always has its count stored.
   */
  private installLegacySeating() {
    const sql = this.ctx.storage.sql;
    const legacy = sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='faction_seats'").toArray();
    if (this.actors.hasSeats() || (!legacy.length && this.metadata?.seatCount !== undefined)) {
      return;
    }
    const rows = legacy.length
      ? sql
          .exec<{ faction_id: string; seat: string }>('SELECT faction_id, seat FROM faction_seats ORDER BY rowid')
          .toArray()
      : [];
    const roster = legacyFixtureRoster(rows, this.metadata?.loadProfile);
    this.ctx.storage.transactionSync(() => {
      this.actors.install(roster);
      const stored = sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
      const seeded = seedFactionState(storedSnapshotSchema.parse(JSON.parse(stored.data)), roster);
      sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(seeded));
    });
  }

  private seatCount(): TableRoster['seatCount'] {
    return this.metadata?.seatCount ?? fixtureRoster(this.metadata?.loadProfile).seatCount;
  }

  /** The stored seating rides on every snapshot the room holds, as the current occupancy already does. */
  private withRoster<Snapshot extends StoredSnapshot>(snapshot: Snapshot): Snapshot {
    return { ...snapshot, roster: this.actors.roster(this.seatCount()) };
  }

  private openRoom(snapshot: StoredSnapshot): Room {
    return new Room(
      snapshot,
      this.metadata?.loadProfile,
      () => this.actors.seats(),
      (userId) => this.actors.factionFor(userId)
    );
  }

  /*
   * The catalogue captures a game retains: the ruleset once at creation, each faction once at
   * public assignment.
   * A record already retained is read back without touching the catalogue, so a retry, a source
   * edit or a deletion changes nothing.
   * Creation and assignment call these when they land; until then only the isolated test fixture does.
   */
  protected async retainRulesetCapture(rulesetId: string, options: { provisional?: boolean } = {}) {
    const existing = this.captures.expectRuleset(rulesetId);
    if (existing) {
      return existing;
    }
    const capture = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).captureRuleset(rulesetId);
    this.requireReady('ruleset', capture.readiness, options);
    return this.ctx.storage.transactionSync(() => this.captures.retainRuleset(capture));
  }

  protected async retainFactionCapture(
    factionId: string,
    extras: readonly ExtraReference[] = [],
    options: { provisional?: boolean } = {}
  ) {
    const existing = this.captures.faction(factionId);
    if (existing) {
      return existing;
    }
    const capture = await new GameCatalogue(this.env.CONVEX_URL, this.env.APPLICATION_ORIGIN).captureFaction(
      factionId,
      extras
    );
    this.requireReady('faction', capture.readiness, options);
    return this.ctx.storage.transactionSync(() => this.captures.retainFaction(capture));
  }

  /** A real game retains only ready content; the isolated development path may retain provisional content and says so. */
  private requireReady(subject: string, readiness: CaptureReadiness, options: { provisional?: boolean }) {
    const problem = readiness.problems[0];
    if (!readiness.ready && !options.provisional && problem) {
      throw new GameRejection(`This ${subject} is not ready: ${problem.subject}, ${problem.reason}`);
    }
  }

  protected retainedCaptures() {
    return { ruleset: this.captures.ruleset() ?? null, factions: this.captures.factions() };
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
      if (!this.initializeValidated(args, validation)) {
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
    validation: ReturnType<typeof playProvisioningValidationSchema.parse>
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
    this.initialize({
      ...args,
      expiresAt: validation.expiresAt,
      confirmed: false,
      ...('loadProfile' in validation && validation.loadProfile ? { loadProfile: validation.loadProfile } : {}),
      ...('game' in validation ? { game: validation.game } : {}),
    });
    return true;
  }

  /*
   * A fixture opens with its houses and pieces; a real game opens drafting with an empty table, its
   * minimum count of stations and its creator in the first seat, and nothing from any fixture.
   */
  private initialize(provisioned: Metadata) {
    const game = provisioned.game;
    const roster: TableRoster = game
      ? { seatCount: game.minimumPlayers, seats: [{ id: CREATOR_SEAT, position: 0, faction: null }] }
      : fixtureRoster(provisioned.loadProfile);
    const metadata: Metadata = { ...provisioned, seatCount: roster.seatCount, historyRepair: HISTORY_REPAIR_VERSION };
    const snapshot = game
      ? storedSnapshotSchema.parse(creatorSeated(emptySnapshot(), roster, game.creator.displayName))
      : fixtureSnapshot(roster, metadata.loadProfile);
    const data = JSON.stringify(snapshot);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO metadata VALUES (1, ?)', JSON.stringify(metadata));
      this.ctx.storage.sql.exec('INSERT INTO current_state VALUES (1, ?)', data);
      this.ctx.storage.sql.exec(
        "INSERT INTO history VALUES (0, 0, 0, 0, 'checkpoint', ?, ?)",
        data,
        new TextEncoder().encode(data).byteLength
      );
      this.actors.install(roster);
      if (game) {
        this.actors.seatCreator(game.creator.userId, game.creator.displayName, CREATOR_SEAT);
        this.directory.stage(this.directorySummary(snapshot, Date.now(), metadata), Date.now());
      }
    });
    this.metadata = metadata;
    this.room = this.openRoom(snapshot);
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
      this.revealDueBattle();
      await this.deliverDirectory();
    } else {
      await this.confirmProvisioning();
    }
  }

  /** One alarm serves the battle deadline and the directory retry: whichever is due first. */
  private scheduleAlarm() {
    const deadlines = [this.room?.snapshot.battleState?.deadline, this.directory.pending()?.retryAt].filter(
      (deadline): deadline is number => deadline != null
    );
    return deadlines.length ? this.ctx.storage.setAlarm(Math.min(...deadlines)) : this.ctx.storage.deleteAlarm();
  }

  /*
   * The directory summary a real game owes the lobby: its stage, who holds which seat with any
   * public faction, the phase during play and the time of its last durable change. Fixtures
   * publish nothing; the lobby lists real games only.
   */
  private directorySummary(snapshot: StoredSnapshot, now: number, metadata = this.metadata!): PlayDirectorySummary {
    const stage = snapshot.stage ?? 'play';
    const seatCount = metadata.seatCount ?? this.seatCount();
    const factions = new Map(this.actors.roster(seatCount).seats.map((seat) => [seat.id, seat.faction]));
    return {
      stage,
      seatCount,
      seats: this.actors.seated().map(({ seat, userId }) => ({ seat, userId, faction: factions.get(seat) ?? null })),
      phase: stage === 'play' ? snapshot.phase : null,
      lastActivityAt: now,
      result: null,
    };
  }

  /** Stages the summary inside the caller's transaction, so the change and its delivery obligation commit together. */
  private stageDirectory(snapshot: StoredSnapshot, now: number) {
    if (this.metadata?.game) {
      this.directory.stage(this.directorySummary(snapshot, now), now);
    }
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
    for (let pending = this.directory.pending(); pending; pending = this.directory.pending()) {
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
          this.directory.acknowledge(pending.sequence);
          this.diagnostics.report('directory', new Error('Directory delivery refused.'));
        } else if (result.sequence > pending.sequence) {
          this.directory.advance(result.sequence);
        } else {
          this.directory.acknowledge(pending.sequence);
        }
      } catch (error) {
        this.diagnostics.report('directory', error);
        const wait = Math.min(PLAY_DIRECTORY_RETRY_CEILING_MS, PLAY_DIRECTORY_RETRY_MS * 2 ** pending.attempts);
        this.directory.defer(pending.sequence, Date.now() + wait);
        break;
      }
    }
    await this.scheduleAlarm();
  }

  private revealDueBattle() {
    if (!this.room) {
      return;
    }
    const next = expireBattle(this.room.snapshot, Date.now());
    if (!next) {
      return;
    }
    const history = this.battleCheckpoint(next);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.writeHistory(history);
      this.stageDirectory(next, Date.now());
    });
    this.historyStep = history.step;
    this.boundary = next;
    this.room.accept(next);
    this.deliverDirectorySoon();
    for (const [socket, connection] of this.connections) {
      this.sendView(socket, connection);
    }
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
        metadata.confirmed = true;
        this.ctx.storage.sql.exec('UPDATE metadata SET data=? WHERE id=1', JSON.stringify(metadata));
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
    const oldSeat = this.actors.seatFor(userId);
    const committed = this.ctx.storage.transactionSync(() => {
      this.actors.delete(userId, eventId);
      this.spiceLedger.deleteActor(userId);
      if (this.room) {
        const stored = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one();
        const snapshot = storedSnapshotSchema.parse(JSON.parse(stored.data));
        const controls = snapshot.controls;
        const next = this.withRoster(
          this.spiceLedger.project({
            ...snapshot,
            ...(oldSeat && controls
              ? {
                  controls: {
                    ...controls,
                    ready: controls.ready.filter((seat) => seat !== oldSeat),
                    seats: this.actors.seats(),
                  },
                }
              : {}),
          })
        );
        this.ctx.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
        this.stageDirectory(next, Date.now());
        return { snapshot: next, boundary: this.restoreHistory(this.historyStep) };
      }
    });
    this.reloadMetadata();
    if (committed) {
      this.room!.accept(committed.snapshot);
      this.boundary = committed.boundary;
      this.deliverDirectorySoon();
    }
    for (const [socket, connection] of this.connections) {
      if (connection.viewer?.userId === userId) {
        this.deny(socket);
      }
    }
    for (const [socket, connection] of this.connections) {
      this.sendView(socket, connection);
    }
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
      const seat = this.actors.seatFor(connection.viewer.userId);
      if (!seat) {
        return false;
      }
      if (seat !== connection.viewer.viewerSeat) {
        this.room?.clearActivity(connection.connectionId);
        connection.viewer = this.actors.viewer(
          connection.connectionId,
          connection.viewer.userId,
          connection.viewer.displayName,
          { seatNewcomers: !this.metadata?.game }
        );
      }
    }
    return allowed;
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
        connection.viewer!.displayName,
        { seatNewcomers: !this.metadata?.game }
      );
    } catch {
      this.deny(socket);
      return;
    }
    connection.announced = 'authorized';
    connection.everAuthorized = true;
    const controls = this.room!.snapshot.controls ?? emptyPublicControls();
    this.room!.snapshot = this.withRoster({
      ...this.room!.snapshot,
      controls: { ...controls, seats: this.actors.seats() },
    });
    /* The announced socket may be resuming from a suspension its client leaves only for a full view. */
    this.sendView(socket, connection);
    for (const [peer, other] of this.connections) {
      if (peer !== socket && other.viewer && other.announced === 'authorized' && this.authorized(peer)) {
        this.send(peer, this.delivery.update(peer, other.viewer, this.roomFrame(other.viewer), { committed: true }));
      }
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
    if (!this.authorized(socket)) {
      this.authorizationChanged();
      return;
    }
    if (this.room!.sweep()) {
      this.broadcastActivity();
    }
    try {
      this.revealDueBattle();
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
        ? { contents: this.projection.contents(await catalogue.capture(message.selection)) }
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
    if (this.alreadyCommitted(`${connection.viewer!.userId}:${message.commandId}`, message)) {
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
        this.delivery.enable(socket);
        this.sendView(socket, connection);
        return;
      case 'spice-history':
        this.send(socket, { type: 'spice-history', before: message.before, ...this.spiceLedger.page(message.before) });
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

  private sendHistory(socket: WebSocket, step: number) {
    if (step > this.historyStep) {
      throw new GameRejection('Unknown history step.');
    }
    const factionId = this.actors.factionFor(this.connections.get(socket)!.viewer!.userId);
    this.send(socket, {
      type: 'history',
      step,
      lastStep: this.historyStep,
      snapshot: this.projection.snapshot(this.restoreHistory(step), factionId),
    });
  }

  private sendMetrics(socket: WebSocket) {
    this.send(socket, {
      type: 'metrics',
      revision: this.room!.snapshot.revision,
      historySteps: this.historyStep,
      receiptCount: this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM receipts').one().count,
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
    const room = this.room!;
    const viewer = connection.viewer!;
    switch (message.type) {
      case 'pointer':
      case 'pose':
        this.moveActivity(connection, message);
        return;
      case 'begin': {
        const draft = room.begin(viewer, message);
        this.send(socket, {
          type: 'carry',
          carryId: message.carryId,
          draft: this.projection.draft(draft, this.room!.snapshot),
        });
        break;
      }
      case 'take': {
        const draft = room.take(viewer, message);
        this.send(socket, {
          type: 'carry',
          carryId: message.carryId,
          draft: this.projection.draft(draft, this.room!.snapshot),
        });
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
      room.pointer(viewer, message.position, Date.now(), message.seq);
    } else if (!room.pose(viewer, message)) {
      return;
    }
    this.motionForwarded++;
    this.activityTimer ??= setTimeout(() => this.broadcastActivity(), 50);
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

  private commit(socket: WebSocket, connection: Connection, message: CommitMessage, contents?: SpawnContents) {
    if (!this.authorized(socket)) {
      return;
    }
    this.revealDueBattle();
    const viewer = connection.viewer!;
    const room = this.room!;
    const key = `${viewer.userId}:${message.commandId}`;
    if (this.alreadyCommitted(key, message)) {
      this.sendView(socket, connection, message.commandId);
      return;
    }
    const next = this.withRoster(
      storedSnapshotSchema.parse(
        message.type === 'drop'
          ? room.drop(viewer, message.carryId, message.position, message.orientation)
          : message.action.kind === 'spawn-request'
            ? room.publicCommand(viewer, message.action, contents)
            : room.command(viewer, message.action, message.expectedRevision)
      )
    );
    const transfer = this.spiceLedger.describe(
      room.snapshot,
      next,
      message,
      viewer,
      this.actors.factionFor(viewer.userId)
    );
    if (transfer) {
      next.spiceTransfers = [transfer, ...(room.snapshot.spiceTransfers ?? [])].slice(0, 20);
    }
    const history = this.historyEntry(message, next);
    this.persistCommit({ key, viewer, message, next, history, contents, transfer });
    this.deliverDirectorySoon();
    room.accept(
      next,
      message.type === 'drop' ? message.carryId : undefined,
      message.type === 'command' && ['reset', 'enforcement'].includes(message.action.kind)
    );
    if (history) {
      this.historyStep = history.step;
      this.boundary = next;
    }
    if (message.type === 'command' && message.action.kind.startsWith('battle-')) {
      this.ctx.waitUntil(this.scheduleAlarm().catch((error) => this.diagnostics.report('battle-alarm', error)));
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

  private battleCheckpoint(next: StoredSnapshot): HistoryRow {
    const data = JSON.stringify(next);
    return {
      step: this.historyStep + 1,
      base_revision: this.boundary!.revision,
      revision: next.revision,
      phase: next.phase,
      kind: 'checkpoint',
      data,
      bytes: new TextEncoder().encode(data).byteLength,
    };
  }

  private writeHistory(history: HistoryRow) {
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

  private historyEntry(message: CommitMessage, next: StoredSnapshot): HistoryRow | undefined {
    if (message.type === 'command' && message.action.kind === 'battle-outcome' && !next.battleState) {
      return this.battleCheckpoint(next);
    }
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

  private definitionsFor(requestId: string): SpawnContents['definitions'] {
    const row = this.ctx.storage.sql
      .exec<{ definitions: string }>('SELECT definitions FROM spawn_requests WHERE request_id=?', requestId)
      .toArray()[0];
    return row ? (JSON.parse(row.definitions) as SpawnContents['definitions']) : [];
  }

  private persistCommit(commit: {
    key: string;
    viewer: Viewer;
    message: CommitMessage;
    next: StoredSnapshot;
    history?: HistoryRow;
    contents?: SpawnContents;
    transfer?: SpiceTransfer;
  }) {
    const { key, viewer, message, next, history, contents, transfer } = commit;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(next));
      this.stageDirectory(next, Date.now());
      const result = next.battleResults[0];
      if (result && result.revision === next.revision) {
        this.ctx.storage.sql.exec('INSERT INTO battle_results VALUES(?,?)', result.revision, JSON.stringify(result));
      }
      if (transfer) {
        this.spiceLedger.record(transfer, viewer.userId);
      }
      this.ctx.storage.sql.exec(
        'INSERT INTO receipts VALUES(?,?,?,?)',
        key,
        viewer.userId,
        JSON.stringify(message),
        next.revision
      );
      if (
        message.type === 'command' &&
        ['spawn-request', 'spawn-approve', 'spawn-dismiss'].includes(message.action.kind)
      ) {
        const action = message.action;
        const pendingBefore = this.room!.snapshot.controls?.requests.length ?? 0;
        /* A sole player's request spawns directly and files nothing; only a filed request gets a row. */
        const filed =
          action.kind === 'spawn-request' && (next.controls?.requests.length ?? 0) > pendingBefore
            ? next.controls!.requests.at(-1)
            : undefined;
        const request =
          'requestId' in action
            ? this.room!.snapshot.controls?.requests.find((entry) => entry.id === action.requestId)
            : filed;
        if (filed) {
          this.ctx.storage.sql.exec(
            'INSERT OR IGNORE INTO spawn_requests VALUES(?,?,?)',
            filed.id,
            viewer.userId,
            JSON.stringify(contents?.definitions ?? [])
          );
        }
        const recorded = contents ?? (request && { ...request.contents, definitions: this.definitionsFor(request.id) });
        this.ctx.storage.sql.exec(
          'INSERT INTO public_action_history VALUES(?,?,?,?,?,?)',
          key,
          viewer.userId,
          viewer.displayName,
          JSON.stringify(action),
          JSON.stringify(recorded),
          Date.now()
        );
      }
      if (history) {
        this.writeHistory(history);
      }
    });
  }

  private broadcastCommittedView(connection: Connection, message: CommitMessage) {
    this.clearActivityTimer();
    for (const [peer, identity] of this.connections) {
      if (identity.viewer && this.authorized(peer)) {
        this.send(
          peer,
          this.delivery.update(peer, identity.viewer, this.roomFrame(identity.viewer), {
            committed: true,
            completedCommandId: identity.connectionId === connection.connectionId ? message.commandId : undefined,
          })
        );
      }
    }
  }

  private restoreHistory(step: number): StoredSnapshot {
    const checkpoint = this.ctx.storage.sql
      .exec<HistoryRow>("SELECT * FROM history WHERE kind='checkpoint' AND step<=? ORDER BY step DESC LIMIT 1", step)
      .one();
    let snapshot = storedSnapshotSchema.parse(JSON.parse(checkpoint.data));
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
    /* A patch row written before the seat-named requester replays the old key; the parse strips it. */
    return this.spiceLedger.project(this.actors.publicSnapshot(storedSnapshotSchema.parse(snapshot)));
  }

  private restorePatch(snapshot: StoredSnapshot, row: HistoryRow): StoredSnapshot {
    const next = storedSnapshotSchema.parse(applyPatch(snapshot, JSON.parse(row.data) as Patch[]));
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
      const phaseCooldownMs = Math.max(
        0,
        (this.room?.snapshot.controls?.phaseChangedAt ?? 0) + PHASE_CHANGE_COOLDOWN_MS - Date.now()
      );
      const battleCountdownMs = Math.max(0, (this.room?.snapshot.battleState?.deadline ?? 0) - Date.now());
      const data = JSON.stringify(
        message.type === 'view' || message.type === 'update'
          ? { ...message, phaseCooldownMs, battleCountdownMs }
          : message
      );
      socket.send(data);
      this.messagesSent++;
      if (message.type === 'activity' || (message.type === 'update' && !message.snapshot)) {
        this.activityDeliveries++;
      }
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

  private roomFrame(viewer: Viewer): RoomFrame {
    return {
      epoch: this.room!.epoch,
      snapshot: this.projection.snapshot(this.room!.snapshot, this.actors.factionFor(viewer.userId)),
      carries: this.projection.carries(this.room!.publicCarries()),
      pointers: [...this.room!.pointers.values()],
    };
  }

  private sendView(socket: WebSocket, connection: Connection, completedCommandId?: string) {
    if (connection.viewer && this.room && this.authorized(socket)) {
      this.send(
        socket,
        this.delivery.view(socket, connection.viewer, this.roomFrame(connection.viewer), completedCommandId)
      );
    }
  }

  private clearActivityTimer() {
    clearTimeout(this.activityTimer ?? null);
    this.activityTimer = undefined;
  }

  private broadcastActivity() {
    this.clearActivityTimer();
    if (!this.room || !this.connections.size) {
      return;
    }
    for (const [socket, connection] of this.connections) {
      if (connection.viewer && this.authorized(socket)) {
        this.send(
          socket,
          this.delivery.update(socket, connection.viewer, this.roomFrame(connection.viewer), { committed: false })
        );
      }
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

  private sweepConnections() {
    this.revealDueBattle();
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
