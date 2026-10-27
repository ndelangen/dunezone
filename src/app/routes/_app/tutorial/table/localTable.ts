import { isDraftAction } from '@shared/play/drafting';
import type { LogEntry, LogTab } from '@shared/play/log';
import { isSeatAction } from '@shared/play/participation';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { GameRejection } from '@shared/play/rejection';
import { isRemovalAction } from '@shared/play/removal';
import { isResultAction } from '@shared/play/result';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { isSwapAction } from '@shared/play/swapping';

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
 * apply as the session applies them, since they change only the stored state. A table that starts before the deal also runs
 * the session's seating, draft, trading and seat requests (`LocalSession`). Removal votes and the log stay as they were stored.
 * The tutorial's chapters and the Play sandbox story both play on it.
 */

type View = Extract<ServerMessage, { type: 'view' }>;
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

/* The session commits these families outside the table, so a local table refuses them. */
const SESSION_ONLY = [isDraftAction, isSwapAction, isSeatAction, isRemovalAction];
const sessionOnly = (action: { kind: string }) =>
  action.kind === 'spawn-request' || SESSION_ONLY.some((family) => family(action));

/** One live table started from a stored state, answering the messages the page sends as the game Worker's session would. */
export class LocalTable {
  readonly room: Room;
  private readonly projection = new RoomProjection('local');
  private readonly opening: TableStart;
  private readonly factions: Map<string, string>;
  /* Before the deal, who sits where and what they play is the session's to say. */
  private readonly session: LocalSession | undefined;
  /* The page's player, who keeps their account as their seat changes. */
  private readonly learner: string;
  private tradingTimer: ReturnType<typeof setTimeout> | undefined;
  private battleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Delivers a frame to the page; the transport sets it once the page connects. */
  deliver: (message: ServerMessage) => void = () => {};
  /** The seat the page is viewed as. */
  seat: string;
  /** Why the room refused the latest message it refused, for a test to assert on. */
  refusal: string | undefined;

  constructor(start: TableStart) {
    this.opening = start;
    const { stored } = start;
    const seatFaction = new Map(
      stored.roster?.seats.flatMap((entry) => (entry.faction ? [[entry.id, entry.faction.id]] : []))
    );
    this.factions = new Map(
      Object.values(start.viewers).flatMap((viewer) => {
        const faction = seatFaction.get(viewer.viewerSeat);
        return faction ? [[viewer.userId, faction]] : [];
      })
    );
    this.seat = start.viewers[start.seat] ? start.seat : 'seat-1';
    this.learner = start.viewers[this.seat]!.userId;
    this.session = start.draft
      ? new LocalSession({
          stored,
          viewers: Object.values(start.viewers),
          players: start.players,
          minimumPlayers: start.draft.minimumPlayers,
          deal: start.draft.deal,
        })
      : undefined;
    /* No phase cooldown, as on the test stack: a local table is for trying things. */
    this.room = new Room(
      stored,
      () => stored.controls?.seats ?? [],
      (userId) => this.factionFor(userId),
      undefined,
      0
    );
  }

  private factionFor(userId: string) {
    return this.session ? this.session.factionOf(userId) : this.factions.get(userId);
  }

  /** Every seat a player sits in; the spectator watches and acts for no one. */
  seats() {
    if (this.session) {
      return this.session.actors.seats();
    }
    return Object.keys(this.opening.viewers).filter((seat) => seat !== SPECTATOR_SEAT);
  }

  /* As the session does on every commit, an open Determine winner closes once the table leaves Mentat Pause. */
  private settled<Snapshot extends StoredSnapshot>(snapshot: Snapshot): Snapshot {
    return settleEnding(snapshot, () => new Set(this.seats().map((seat) => this.viewer(seat).userId)));
  }

  viewer(seat = this.seat): Viewer {
    const session = this.session;
    if (!session) {
      return this.opening.viewers[seat]!;
    }
    /* Seats change hands before the deal, so a seat's viewer is whoever holds it now, the page's own player first. */
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
        /* Who sits where comes from the session's directory in a real game; a local table keeps the recorded names. */
        controls:
          projected.controls &&
          (this.session
            ? this.session.forViewer(projected.controls, viewer)
            : { ...projected.controls, players: this.opening.players, seatRequests: [] }),
        ...(this.opening.removalVotes ? { removalVotes: this.opening.removalVotes } : {}),
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

  /** The recorded log as it stood at the start; moves made on a local table are not logged. */
  log(): Partial<Record<LogTab, LogEntry[]>> {
    return this.opening.log;
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
      handle(message, viewer, own);
    } catch (error) {
      this.refuse(message, viewer, own, error);
    }
    return true;
  }

  private readonly handlers: {
    [Type in TableMessage['type']]?: (message: MessageOf<Type>, viewer: Viewer, own: boolean) => void;
  } = {
    sync: () => this.deliver(this.frame()),
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
    command: (message, viewer, own) => this.commit(message, viewer, own),
    drop: (message, viewer, own) => this.commit(message, viewer, own),
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
    } else {
      room.cancel(viewer, message.carryId);
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
  private commit(message: MessageOf<'command' | 'drop'>, viewer: Viewer, own: boolean) {
    const room = this.room;
    if (message.type === 'command' && this.session && isSessionAction(message.action)) {
      room.assertRevision(message.action, message.expectedRevision);
      room.accept(this.session.commit(room.snapshot, viewer, message.action, Date.now()));
      this.seat = this.session.seatOf(this.learner);
      this.scheduleTradingClose();
      this.deliver(this.frame(this.seat, own ? message.commandId : undefined));
      return;
    }
    if (message.type === 'command' && isResultAction(message.action)) {
      room.assertRevision(message.action, message.expectedRevision);
      room.accept(this.settled(applyResult(room.snapshot, viewer, message.action, Date.now())));
      this.deliver(this.frame(this.seat, own ? message.commandId : undefined));
      return;
    }
    const next = storedSnapshotSchema.parse(
      message.type === 'drop'
        ? room.drop(viewer, message.carryId, message)
        : room.command(viewer, this.tableAction(message.action), message.expectedRevision)
    );
    const completedCarryId = message.type === 'drop' ? message.carryId : undefined;
    const clearAll = message.type === 'command' && message.action.kind === 'reset';
    const cleaned = room.finishSetupCleanup(next, completedCarryId, clearAll);
    room.accept(this.settled(cleaned ?? next), completedCarryId, clearAll);
    this.scheduleBattleReveal();
    this.deliver(this.frame(this.seat, own ? message.commandId : undefined));
  }

  private tableAction(action: MessageOf<'command'>['action']): RoomAction {
    if (sessionOnly(action)) {
      throw new GameRejection(
        'This table runs the table only. Drafting, seats, votes and catalogue requests need a real game.'
      );
    }
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
    if (this.room.snapshot.battleState?.stage !== 'countdown' || !deadline) {
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
    if (!this.session || this.room.snapshot.stage !== 'swapping' || !trading || trading.closed) {
      return;
    }
    this.tradingTimer = setTimeout(
      () => {
        const closed = this.session?.expireTrading(this.room.snapshot, Date.now());
        if (closed) {
          this.room.accept(closed);
          this.deliver(this.frame());
        }
      },
      Math.max(0, trading.deadline - Date.now())
    );
  }

  /** Whether the page can be viewed as a seat: one recorded, or one someone holds now. */
  private seatable(seat: string) {
    return Boolean(this.opening.viewers[seat]) || Boolean(this.session?.actors.holderOf(seat));
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
    return message.requestId;
  }
  if ('carryId' in message) {
    return message.carryId;
  }
  return 'message';
}
