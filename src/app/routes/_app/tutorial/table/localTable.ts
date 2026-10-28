import { capturedTokenStackKey } from '@shared/play/assetCapture';
import { spawnableKey } from '@shared/play/inventory';
import type { SpawnSelection, StoredSpawnContents } from '@shared/play/inventory';
import { LOG_PAGE_SIZE } from '@shared/play/log';
import type { LogEntry, LogTab } from '@shared/play/log';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { GameRejection } from '@shared/play/rejection';
import { isResultAction } from '@shared/play/result';
import { isReviewAction, REVIEW_CHECKPOINTS, reviewableStage, reviewRunning } from '@shared/play/review';

import { expireBattle } from '../../../../../../workers/game/battle';
import { applyResult, settleEnding } from '../../../../../../workers/game/result';
import { Room } from '../../../../../../workers/game/room';
import {
  internalAction,
  internalPieceId,
  RoomProjection,
  storedSnapshotSchema,
} from '../../../../../../workers/game/state';
import type { StoredSnapshot } from '../../../../../../workers/game/state';
import { isSessionAction, LocalSession } from './localSession';
import type { RecordedDeal } from './localSession';

/*
 * The game Worker's own table (`Room`) running in the browser, from a stored state: pieces move, cards draw, phases change
 * and battles resolve exactly as the Worker decides, for whichever seat the page is viewed as. Determine winner and its result
 * apply as the session applies them, since they change only the stored state. Every table also runs the session's seating,
 * seat requests and removal votes, and one that starts before the deal its draft and trading (`LocalSession`).
 * Checkpoints, review votes and public events are recorded by the Worker's history and log classes.
 * The tutorial's chapters and the Play sandbox story both play on it.
 */

type View = Extract<ServerMessage, { type: 'view' }>;
/** A carry the page's player set down: the items it held, by id, and whether a take added to it while it was held. */
export type Landing = Readonly<{ itemIds: readonly string[]; grew: boolean }>;

export type TableMessage = Exclude<ClientMessage, { type: 'admit' | 'log-history' | 'conversation-history' }>;
type MessageOf<Type extends TableMessage['type']> = Extract<TableMessage, { type: Type }>;
type RoomAction = Parameters<Room['command']>[1];

/** Where a local table starts: the stored state, every seat's viewer, the names at the table, and the log so far. */
export type TableStart = Readonly<{
  stored: StoredSnapshot;
  viewers: Readonly<Record<string, Viewer>>;
  players: NonNullable<GameSnapshot['controls']>['players'];
  removalVotes?: GameSnapshot['removalVotes'];
  log: Partial<Record<LogTab, LogEntry[]>>;
  /** The seat the page is viewed as. */
  seat: string;
  /** For a table that starts before the deal: the players the draft waits for, and how the recording dealt. */
  draft?: Readonly<{ minimumPlayers: number; deal: RecordedDeal }>;
}>;

/** One live table started from a stored state, answering the messages the page sends as the game Worker's session would. */
export class LocalTable {
  readonly room: Room;
  private readonly projection = new RoomProjection('local');
  private readonly opening: TableStart;
  /* Who sits where and what they play is the session's to say, as in the Worker. */
  private readonly session: LocalSession;
  /* The page's player, who keeps their account as their seat changes. */
  private readonly learner: string;
  /* The page's player's carries that a take has added to, and the carries they have set down. */
  private readonly grown = new Set<string>();
  private readonly landed: Landing[] = [];
  private tradingTimer: ReturnType<typeof setTimeout> | undefined;
  private battleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Delivers a frame to the page; the transport sets it once the page connects. */
  deliver: (message: ServerMessage) => void = () => {};
  /** The seat the page is viewed as. */
  seat: string;
  /** Why the room refused the latest message it refused, for a test to assert on. */
  refusal: string | undefined;
  /* What the catalogue captured for the spawn request being committed, as the Worker hands its capture to the commit. */
  private spawnContents: StoredSpawnContents | undefined;
  /* The asset each catalogue selection captured, by its picker key, so the guide follows a request and its pieces by what was asked for. */
  private readonly captured = new Map<string, string>();

  constructor(start: TableStart) {
    this.opening = start;
    const { stored } = start;
    this.seat = start.viewers[start.seat] ? start.seat : 'seat-1';
    this.learner = start.viewers[this.seat]!.userId;
    this.session = new LocalSession({
      stored,
      viewers: Object.values(start.viewers),
      players: start.players,
      minimumPlayers: start.draft?.minimumPlayers ?? 0,
      deal: start.draft?.deal ?? [],
      logOffset: Math.max(
        0,
        ...Object.values(start.log)
          .flat()
          .map((entry) => entry.sequence)
      ),
    });
    /* No phase cooldown, as on the test stack: a local table is for trying things. */
    this.room = new Room(
      stored,
      () => this.session.actors.seats(),
      (userId) => this.factionFor(userId),
      undefined,
      0
    );
  }

  private factionFor(userId: string) {
    return this.session.factionOf(userId);
  }

  /** Every seat a player sits in; the spectator watches and acts for no one. */
  seats() {
    return this.session.actors.seats();
  }

  /* As the session does on every commit, an open Determine winner closes once the table leaves Mentat Pause. */
  private settled<Snapshot extends StoredSnapshot>(snapshot: Snapshot): Snapshot {
    return settleEnding(snapshot, () => new Set(this.seats().map((seat) => this.viewer(seat).userId)));
  }

  viewer(seat = this.seat): Viewer {
    const session = this.session;
    /* Seats change hands, so a seat's viewer is whoever holds it now, the page's own player first. */
    const viewers = Object.values(this.opening.viewers).sort((a, b) =>
      a.userId === this.learner ? -1 : b.userId === this.learner ? 1 : 0
    );
    const holder = viewers.find((viewer) => session.seatOf(viewer.userId) === seat) ?? this.opening.viewers[seat]!;
    return { ...holder, viewerSeat: seat };
  }

  /** The view a seat receives of the room as it stands, projected as the Worker projects it. */
  frame(seat = this.seat, completedCommandId?: string): View {
    const room = this.room;
    const viewer = this.viewer(seat);
    const projected = this.projection.snapshot(room.snapshot, this.factionFor(viewer.userId));
    const frame = {
      type: 'view' as const,
      viewer,
      epoch: room.epoch,
      snapshot: {
        ...projected,
        ...(reviewableStage(room.snapshot.stage)
          ? {
              review: this.session.reviews.current(),
              reviewCheckpoints: this.session.history.recent(REVIEW_CHECKPOINTS),
            }
          : {}),
        /* Who sits where comes from the session's directory, as in a real game. */
        controls: projected.controls && this.session.forViewer(projected.controls, viewer),
        /* A recorded table's votes show as they were stored; the votes opened here follow them. */
        ...(room.snapshot.stage
          ? { removalVotes: [...(this.opening.removalVotes ?? []), ...this.session.removalVotes()] }
          : {}),
      },
      carries: this.projection.carries(room.publicCarries(), room.snapshot),
      pointers: [...room.pointers.values()],
      phaseCooldownMs: 0,
      battleCountdownMs: Math.max(0, (room.snapshot.battleState?.deadline ?? 0) - Date.now()),
      ...(completedCommandId ? { completedCommandId } : {}),
      /* A local table's clock is the browser's, since the room dates its deadlines from `Date.now()`. */
      serverNow: Date.now(),
    };
    return frame as View;
  }

  /** Every carry the page's player has set down, oldest first. */
  landings(): readonly Landing[] {
    return this.landed;
  }

  /** The latest pages, also used by the sandbox transport. */
  log(): Partial<Record<LogTab, LogEntry[]>> {
    return {
      game: this.logPage('game', Number.MAX_SAFE_INTEGER).entries,
      audit: this.logPage('audit', Number.MAX_SAFE_INTEGER).entries,
    };
  }

  /** New events follow the chapter's recorded log, using the same sequence across both tabs. */
  logPage(tab: LogTab, before: number) {
    const recent = this.session.log.page(tab, before);
    const entries = [...recent.entries, ...(this.opening.log[tab] ?? []).filter((entry) => entry.sequence < before)];
    return { entries: entries.slice(0, LOG_PAGE_SIZE), more: recent.more || entries.length > LOG_PAGE_SIZE };
  }

  /** Finished games replay publicly; during play only the agreed review checkpoint is readable. */
  history(step: number): Extract<ServerMessage, { type: 'history' }> {
    const live = this.room.snapshot;
    if (live.stage !== undefined && live.stage !== 'finished' && this.session.reviews.running()?.step !== step) {
      throw new GameRejection('Replay opens once the game is finished.');
    }
    if (step > this.session.history.steps || step < 0) {
      throw new GameRejection('Unknown history step.');
    }
    const past = this.projection.snapshot(
      this.session.history.restore(step),
      live.stage === undefined ? this.factionFor(this.viewer().userId) : undefined,
      live
    );
    return {
      type: 'history',
      step,
      lastStep: this.session.history.steps,
      recordedAt: this.session.history.recordedAt(step),
      snapshot: past,
    };
  }

  /** Shows the page as another seat; the seat it leaves lets go of anything it was carrying. */
  viewAs(seat: string) {
    if (!this.seatable(seat) || seat === this.seat) {
      return;
    }
    this.room.clearActivity(this.viewer().connectionId);
    this.cleanUpSetup();
    this.seat = seat;
    this.deliver(this.frame());
  }

  /**
   * Answers one message from `seat` as the Worker would: a carry reply or a rejection to the sender, then the room as it now stands to the page.
   * A seat other than the page's acts as a second player at the same table.
   * Replays, the spice history, conversations and metrics stay with the scripted transport, so those answer false.
   */
  receive(message: TableMessage, seat = this.seat): boolean {
    const handle = this.handlers[message.type] as
      | ((message: TableMessage, viewer: Viewer, own: boolean) => void)
      | undefined;
    if (!handle) {
      return false;
    }
    const viewer = this.viewer(seat);
    const own = seat === this.seat;
    /* A message that answers with no frame of its own, as a carry's pose, still shows a reveal it brought due. */
    if (this.revealDueBattle()) {
      this.deliver(this.frame());
    }
    try {
      const before = this.room.snapshot;
      const running = this.session.reviews.running();
      const committing = message.type === 'command' || message.type === 'drop';
      if (
        running &&
        ((committing && !(message.type === 'command' && isReviewAction(message.action))) ||
          ['begin', 'take', 'flip'].includes(message.type))
      ) {
        throw new GameRejection('The table is paused for a review.');
      }
      this.session.currentSnapshot = before;
      handle(message, viewer, own);
      if (committing) {
        let next = this.session.reviews.reconcile(this.room.snapshot, Date.now());
        if (reviewRunning(running) && !this.session.reviews.running()) {
          const paused = Date.now() - running.startedAt;
          const battle = next.battleState;
          const bidding = next.bidding;
          next = {
            ...next,
            ...(battle?.deadline ? { battleState: { ...battle, deadline: battle.deadline + paused } } : {}),
            ...(bidding?.deadline ? { bidding: { ...bidding, deadline: bidding.deadline + paused } } : {}),
          };
        }
        this.room.accept(next);
        if (this.session.reviews.running()) {
          this.room.cancelCarries();
        }
        const entry = this.session.history.entry(message, before, next);
        if (entry) {
          this.session.history.write(entry);
          this.session.history.accept(entry.step, next);
        }
        this.session.log.recordCommit({ before, next, message, viewer, holders: this.session.actors.occupants() });
        this.session.currentSnapshot = next;
        this.scheduleBattleReveal();
        this.deliver(this.frame(this.seat, own ? message.commandId : undefined));
      }
    } catch (error) {
      this.refuse(message, viewer, own, error);
    }
    return true;
  }

  private readonly handlers: {
    [Type in TableMessage['type']]?: (message: MessageOf<Type>, viewer: Viewer, own: boolean) => void;
  } = {
    sync: () => this.deliver(this.frame()),
    history: (message) => this.deliver(this.history(message.step)),
    pointer: (message, viewer) => {
      this.room.pointer(viewer, message.position, Date.now(), message.seq);
    },
    /* The page shows its own ping as it sends it, and a local table has no other page to pass it on to. */
    ping: () => {},
    pose: (message, viewer, own) => {
      if (this.room.pose(viewer, message) && !own) {
        this.deliver(this.frame());
      }
    },
    /* A renew moves only the carry's expiry, which no page acts on, so no frame goes out, as in the Worker. */
    renew: (message, viewer) => this.room.renew(viewer, message.carryId),
    begin: (message, viewer, own) => this.activity(message, viewer, own),
    take: (message, viewer, own) => this.activity(message, viewer, own),
    flip: (message, viewer, own) => {
      const draft = this.room.flip(viewer, message);
      if (own) {
        const [carry] = this.projection.carries(
          this.room.publicCarries().filter((candidate) => candidate.id === message.carryId),
          this.room.snapshot
        );
        this.deliver({
          type: 'carry',
          carryId: message.carryId,
          draft: this.projection.draft(draft, this.room.snapshot),
          ...(carry ? { held: carry.held } : {}),
        });
      }
      this.deliver(this.frame());
    },
    cancel: (message, viewer, own) => this.activity(message, viewer, own),
    command: (message, viewer) => this.commit(message, viewer),
    drop: (message, viewer) => this.commit(message, viewer),
  };

  /* A refusal as the Worker sends one: a rejected drop lets go of its carry, and an unexpected error is reported but still answered. */
  private refuse(message: TableMessage, viewer: Viewer, own: boolean, error: unknown) {
    if (!(error instanceof GameRejection)) {
      console.error('The local table failed on a message.', error);
    }
    if (message.type === 'drop' && this.room.carries.get(message.carryId)?.connectionId === viewer.connectionId) {
      this.room.cancel(viewer, message.carryId);
      this.cleanUpSetup();
    }
    const reason = error instanceof GameRejection ? error.message : 'Unable to process the command.';
    this.refusal = reason;
    if (own) {
      this.deliver({ type: 'rejected', requestId: requestId(message), message: reason });
    }
    this.deliver(this.frame());
  }

  private activity(message: MessageOf<'begin' | 'take' | 'cancel'>, viewer: Viewer, own: boolean) {
    const room = this.room;
    let draft;
    if (message.type === 'begin') {
      draft = room.begin(viewer, { ...message, sourcePieceId: internalPieceId(room.snapshot, message.sourcePieceId) });
    } else if (message.type === 'take') {
      draft = room.take(viewer, { ...message, donorPieceId: internalPieceId(room.snapshot, message.donorPieceId) });
      if (viewer.viewerSeat === this.seat) {
        this.grown.add(message.carryId);
      }
    } else {
      room.cancel(viewer, message.carryId);
      this.grown.delete(message.carryId);
    }
    this.cleanUpSetup();
    if (draft && own) {
      this.deliver({ type: 'carry', carryId: message.carryId, draft: this.projection.draft(draft, room.snapshot) });
    }
    this.deliver(this.frame());
  }

  /*
   * The table half of the session's commit: the room decides, then setup's Traitor clean-up runs, and nothing is stored.
   * The session's roster pass is left out, so the turn keeps the phase order recorded at the starting step and spice transfers are not described.
   */
  private commit(message: MessageOf<'command' | 'drop'>, viewer: Viewer) {
    const room = this.room;
    if (message.type === 'command' && isReviewAction(message.action)) {
      room.assertRevision(message.action, message.expectedRevision);
      room.accept(
        this.session.reviews.apply({
          snapshot: room.snapshot,
          viewer,
          action: message.action,
          now: Date.now(),
          checkpoint: (step) =>
            this.session.history.recent(REVIEW_CHECKPOINTS).find((entry) => entry.step === step)?.context,
        })
      );
      return;
    }
    if (message.type === 'command' && isSessionAction(message.action)) {
      room.assertRevision(message.action, message.expectedRevision);
      const followsLearner = this.seat === this.session.seatOf(this.learner);
      const seated = this.seats().map((seat) => this.viewer(seat));
      room.accept(this.settled(this.session.commit(room.snapshot, viewer, message.action, Date.now())));
      /* As the Worker refreshes its viewers, a player the command moved or unseated lets go of what they carried. */
      for (const before of seated) {
        if (this.session.seatOf(before.userId) !== before.viewerSeat) {
          room.clearActivity(before.connectionId);
        }
      }
      this.cleanUpSetup();
      /* The page keeps the seat it shows, unless that is the learner's, who may have moved, or a seat the command emptied. */
      if (followsLearner || !this.session.actors.holderOf(this.seat)) {
        this.seat = this.session.seatOf(this.learner);
      }
      this.scheduleTradingClose();
      return;
    }
    if (message.type === 'command' && isResultAction(message.action)) {
      room.assertRevision(message.action, message.expectedRevision);
      room.accept(this.settled(applyResult(room.snapshot, viewer, message.action, Date.now())));
      return;
    }
    /* What the page's player holds as they let go, read before the drop ends the carry. */
    const held = message.type === 'drop' && viewer.viewerSeat === this.seat ? room.heldFor(message.carryId) : null;
    const next = storedSnapshotSchema.parse(
      message.type === 'drop'
        ? room.drop(viewer, message.carryId, message)
        : message.action.kind === 'spawn-request'
          ? room.publicCommand(viewer, message.action, this.spawnContents)
          : room.command(viewer, this.tableAction(message.action), message.expectedRevision)
    );
    const completedCarryId = message.type === 'drop' ? message.carryId : undefined;
    const clearAll = message.type === 'command' && message.action.kind === 'reset';
    const cleaned = room.finishSetupCleanup(next, completedCarryId, clearAll);
    room.accept(this.settled(cleaned ?? next), completedCarryId, clearAll);
    if (held && completedCarryId) {
      /* By the ids the page sees, as a card's are the projection's, under the handles it has where it landed. */
      const { cardHandles, pieceHandles } = room.snapshot;
      const seen = this.projection.piece(held, false, cardHandles, pieceHandles);
      this.landed.push({ itemIds: seen.items.map((item) => item.id), grew: this.grown.delete(completedCarryId) });
    }
  }

  /** A catalogue request, committed with what the page's catalogue captured for it, as the Worker commits one after its capture. */
  requestSpawn(message: MessageOf<'command'>, contents: StoredSpawnContents) {
    if (message.action.kind === 'spawn-request') {
      this.captured.set(spawnableKey(message.action), contents.assetId);
    }
    this.spawnContents = contents;
    try {
      this.receive(message);
    } finally {
      this.spawnContents = undefined;
    }
  }

  /** The asset a catalogue selection captured on this table, once the page has requested it. */
  capturedAsset(selection: SpawnSelection) {
    return this.captured.get(spawnableKey(selection));
  }

  /** The selected token's pieces in the learner's projected view, without relying on public stack keys. */
  capturedPieces(selection: SpawnSelection) {
    const assetId = this.capturedAsset(selection);
    if (!assetId) {
      return [];
    }
    const ids = new Set(
      this.room.snapshot.table.pieces
        .filter((piece) => piece.stackKey === capturedTokenStackKey(assetId))
        .map((piece) => piece.id)
    );
    return this.frame().snapshot.table.pieces.filter((piece) => ids.has(piece.id));
  }

  /** A captured asset as the page's catalogue answer shows it. */
  projectContents(contents: StoredSpawnContents) {
    return this.projection.contents(contents);
  }

  private tableAction(action: MessageOf<'command'>['action']): RoomAction {
    return internalAction(this.room.snapshot, action as RoomAction);
  }

  private cleanUpSetup() {
    const cleaned = this.room.finishSetupCleanup();
    if (cleaned) {
      this.room.accept(cleaned);
    }
  }

  /* A battle countdown ends on the room's deadline, as the Worker's alarm ends it. */
  private revealDueBattle() {
    if (this.session.reviews.running()) {
      return false;
    }
    const next: StoredSnapshot | undefined = expireBattle(this.room.snapshot, Date.now());
    if (next) {
      this.room.accept(next);
      return true;
    }
    return false;
  }

  private scheduleBattleReveal() {
    clearTimeout(this.battleTimer);
    const deadline = this.room.snapshot.battleState?.deadline;
    if (this.session.reviews.running() || this.room.snapshot.battleState?.stage !== 'countdown' || !deadline) {
      return;
    }
    this.battleTimer = setTimeout(
      () => {
        if (this.revealDueBattle()) {
          this.deliver(this.frame());
        }
      },
      Math.max(0, deadline - Date.now())
    );
  }

  /* Trading closes on its deadline, as the session's alarm closes it. */
  private scheduleTradingClose() {
    clearTimeout(this.tradingTimer);
    const trading = this.room.snapshot.swapping;
    if (this.room.snapshot.stage !== 'swapping' || !trading || trading.closed) {
      return;
    }
    this.tradingTimer = setTimeout(
      () => {
        const closed = this.session.expireTrading(this.room.snapshot, Date.now());
        if (closed) {
          this.room.accept(closed);
          this.deliver(this.frame());
        } else {
          /* A timer can fire a moment before the deadline, so it waits out the rest. */
          this.scheduleTradingClose();
        }
      },
      Math.max(0, trading.deadline - Date.now())
    );
  }

  /** Whether the page can be viewed as a seat: one recorded, or one someone holds now. */
  private seatable(seat: string) {
    return Boolean(this.opening.viewers[seat]) || Boolean(this.session.actors.holderOf(seat));
  }

  /** Stops the countdown timers when the page leaves. */
  dispose() {
    clearTimeout(this.battleTimer);
    clearTimeout(this.tradingTimer);
  }

  /** A recorded countdown that ran out before the table opened reveals as it opens. */
  open() {
    this.revealDueBattle();
    this.scheduleBattleReveal();
  }
}

/* The id a rejection answers, as the Worker's `messageId` picks it. */
function requestId(message: TableMessage) {
  if ('commandId' in message) {
    return message.commandId;
  }
  if ('requestId' in message) {
    return message.requestId ?? 'message';
  }
  if ('carryId' in message) {
    return message.carryId;
  }
  return 'message';
}
