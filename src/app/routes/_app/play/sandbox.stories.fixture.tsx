import { isDraftAction } from '@shared/play/drafting';
import type { LogEntry, LogTab } from '@shared/play/log';
import { isSeatAction } from '@shared/play/participation';
import type { ClientMessage, ServerMessage, Viewer } from '@shared/play/protocol';
import { GameRejection } from '@shared/play/rejection';
import { isRemovalAction } from '@shared/play/removal';
import { isResultAction } from '@shared/play/result';
import { isSwapAction } from '@shared/play/swapping';
import type { Decorator } from '@storybook/tanstack-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { UPDATE_STORY_ARGS } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';

import { expireBattle } from '../../../../../workers/game/battle';
import { Room } from '../../../../../workers/game/room';
import {
  internalAction,
  internalPieceId,
  RoomProjection,
  storedSnapshotSchema,
} from '../../../../../workers/game/state';
import type { StoredSnapshot } from '../../../../../workers/game/state';
import recording from './journey.recording/journey.json';
import { journeySteps, journeyViewers, stepCode } from './journey.stories.fixture';
import type { JourneyStep } from './journey.stories.fixture';
import styles from './journey.stories.module.css';
import { storyTransport } from './storyTransport';

/*
 * The Play sandbox: the game Worker's own table (`Room`) running in the browser, started from the room's stored state at
 * a recorded journey step. Pieces move, cards draw, phases change and battles resolve exactly as the Worker decides, for
 * whichever seat the page is viewed as. Drafting, seats, removal votes, the result and the log stay as recorded: those
 * live in the Worker's session and storage, which the sandbox does not run.
 */

type View = Extract<ServerMessage, { type: 'view' }>;
type Message = Exclude<ClientMessage, { type: 'admit' | 'log-history' | 'conversation-history' }>;
type TableMessage<Type extends Message['type']> = Extract<Message, { type: Type }>;
type RoomAction = Parameters<Room['command']>[1];

/* The session commits these families outside the table, so the sandbox refuses them with a pointer to the journey. */
const SESSION_ONLY = [isDraftAction, isSwapAction, isSeatAction, isRemovalAction, isResultAction];
const sessionOnly = (action: { kind: string }) =>
  action.kind === 'spawn-request' || SESSION_ONLY.some((family) => family(action));

/** The steps the sandbox can start from: those the recording kept the room's stored state for, setup onwards. */
export function sandboxSteps(): number[] {
  return journeySteps().flatMap((step, index) => (step.stored ? [index] : []));
}

const clampStart = (index: number) => {
  const steps = sandboxSteps();
  return steps.includes(index) ? index : (steps.find((candidate) => candidate >= index) ?? steps.at(-1)!);
};

/** One live table started from a recorded step, answering the messages the page sends as the session would. */
export class SandboxTable {
  readonly room: Room;
  readonly start: number;
  private readonly projection = new RoomProjection('sandbox');
  private readonly step: JourneyStep;
  private readonly viewers: Record<string, Viewer>;
  private readonly factions: Map<string, string>;
  private battleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Delivers a frame to the page; the transport sets it once the page connects. */
  deliver: (message: ServerMessage) => void = () => {};
  /** The seat the page is viewed as. */
  seat: string;
  /** Why the room refused the latest message it refused, for a story to assert on. */
  refusal: string | undefined;

  constructor(start: number, seat: string) {
    this.start = clampStart(start);
    this.step = journeySteps()[this.start]!;
    const stored = storedSnapshotSchema.parse(this.step.stored);
    /* Every viewer the recording connected, each with a connection of its own so carries keep their owners apart. */
    const last = journeySteps().at(-1)!.views;
    this.viewers = Object.fromEntries(
      journeyViewers().map((id) => {
        const recorded = (this.step.views[id] ?? last[id]!).viewer;
        return [id, { ...recorded, connectionId: `sandbox-${id}` }];
      })
    );
    const seatFaction = new Map(
      stored.roster?.seats.flatMap((entry) => (entry.faction ? [[entry.id, entry.faction.id]] : []))
    );
    this.factions = new Map(
      Object.values(this.viewers).flatMap((viewer) => {
        const faction = seatFaction.get(viewer.viewerSeat);
        return faction ? [[viewer.userId, faction]] : [];
      })
    );
    this.seat = this.viewers[seat] ? seat : 'seat-1';
    /* No phase cooldown, as on the test stack: the sandbox is for trying things. */
    this.room = new Room(
      stored,
      () => stored.controls?.seats ?? [],
      (userId) => this.factions.get(userId),
      undefined,
      0
    );
  }

  viewer(seat = this.seat): Viewer {
    return this.viewers[seat]!;
  }

  /** The view a seat receives of the room as it stands, projected as the Worker projects it. */
  frame(seat = this.seat, completedCommandId?: string): View {
    const room = this.room;
    const viewer = this.viewer(seat);
    const projected = this.projection.snapshot(room.snapshot, this.factions.get(viewer.userId));
    const recorded = this.step.views[seat]?.snapshot ?? this.step.views['seat-1']!.snapshot;
    const frame = {
      type: 'view' as const,
      viewer,
      epoch: room.epoch,
      snapshot: {
        ...projected,
        /* Who sits where comes from the session's directory in a real game; the sandbox keeps the recorded names. */
        controls: projected.controls && {
          ...projected.controls,
          players: recorded.controls?.players ?? [],
          seatRequests: [],
        },
        ...(recorded.removalVotes ? { removalVotes: recorded.removalVotes } : {}),
      },
      carries: this.projection.carries(room.publicCarries(), room.snapshot),
      pointers: [...room.pointers.values()],
      phaseCooldownMs: 0,
      battleCountdownMs: Math.max(0, (room.snapshot.battleState?.deadline ?? 0) - Date.now()),
      ...(completedCommandId ? { completedCommandId } : {}),
      /* The sandbox's clock is the browser's, since the room dates its deadlines from `Date.now()`. */
      serverNow: Date.now(),
    };
    return frame as View;
  }

  /** The recorded log as it stood at the starting step; moves made in the sandbox are not logged. */
  log(): Partial<Record<LogTab, LogEntry[]>> {
    const { log } = recording as unknown as { log: Record<LogTab, LogEntry[]> };
    return {
      game: log.game.filter((entry) => entry.sequence <= this.step.logSequence),
      audit: log.audit,
    };
  }

  /** Shows the page as another seat; the seat it leaves lets go of anything it was carrying. */
  viewAs(seat: string) {
    if (!this.viewers[seat] || seat === this.seat) {
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
  receive(message: Message, seat = this.seat): boolean {
    const handle = this.handlers[message.type] as
      | ((message: Message, viewer: Viewer, own: boolean) => void)
      | undefined;
    if (!handle) {
      return false;
    }
    const viewer = this.viewer(seat);
    const own = seat === this.seat;
    this.revealDueBattle();
    try {
      handle(message, viewer, own);
    } catch (error) {
      this.refuse(message, viewer, own, error);
    }
    return true;
  }

  private readonly handlers: {
    [Type in Message['type']]?: (message: TableMessage<Type>, viewer: Viewer, own: boolean) => void;
  } = {
    sync: () => this.deliver(this.frame()),
    pointer: (message, viewer) => {
      this.room.pointer(viewer, message.position, Date.now(), message.seq);
    },
    pose: (message, viewer, own) => {
      if (this.room.pose(viewer, message) && !own) {
        this.deliver(this.frame());
      }
    },
    /* A renew moves only the carry's expiry, which no page acts on, so no frame goes out, as in the Worker. */
    renew: (message, viewer) => this.room.renew(viewer, message.carryId),
    begin: (message, viewer, own) => this.activity(message, viewer, own),
    take: (message, viewer, own) => this.activity(message, viewer, own),
    cancel: (message, viewer, own) => this.activity(message, viewer, own),
    command: (message, viewer, own) => this.commit(message, viewer, own),
    drop: (message, viewer, own) => this.commit(message, viewer, own),
  };

  /* A refusal as the Worker sends one: a rejected drop lets go of its carry, and an unexpected error is reported but still answered. */
  private refuse(message: Message, viewer: Viewer, own: boolean, error: unknown) {
    if (!(error instanceof GameRejection)) {
      console.error('The sandbox table failed on a message.', error);
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

  private activity(message: TableMessage<'begin' | 'take' | 'cancel'>, viewer: Viewer, own: boolean) {
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
  private commit(message: TableMessage<'command' | 'drop'>, viewer: Viewer, own: boolean) {
    const room = this.room;
    const next = storedSnapshotSchema.parse(
      message.type === 'drop'
        ? room.drop(viewer, message.carryId, message.position, message.orientation)
        : room.command(viewer, this.tableAction(message.action), message.expectedRevision)
    );
    const completedCarryId = message.type === 'drop' ? message.carryId : undefined;
    const clearAll = message.type === 'command' && message.action.kind === 'reset';
    const cleaned = room.finishSetupCleanup(next, completedCarryId, clearAll);
    room.accept(cleaned ?? next, completedCarryId, clearAll);
    this.scheduleBattleReveal();
    this.deliver(this.frame(this.seat, own ? message.commandId : undefined));
  }

  private tableAction(action: TableMessage<'command'>['action']): RoomAction {
    if (sessionOnly(action)) {
      throw new GameRejection(
        'The sandbox runs the table only. Drafting, seats, votes, catalogue requests and the result play out in Play/Journey.'
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

  /** Stops the countdown timer when the story leaves. */
  dispose() {
    clearTimeout(this.battleTimer);
  }

  /** A recorded countdown that ran out while the story was closed reveals as the sandbox opens. */
  open() {
    this.revealDueBattle();
    this.scheduleBattleReveal();
  }
}

/* The id a rejection answers, as the Worker's `messageId` picks it. */
function requestId(message: Message) {
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

/** What the story shows: the live table and the transport the page is connected through. */
export const sandbox: { table?: SandboxTable; transport?: ReturnType<typeof storyTransport> } = {};

/**
 * Starts a sandbox at a journey step (0-based) viewed as a seat, and the scripted transport around it.
 * Storybook runs a story's `beforeEach` again on every change of its arguments, so a page already connected keeps its transport; the panel moves the table itself.
 */
export function sandboxTransport(start: number, seat: string) {
  if (sandbox.transport?.connected()) {
    return sandbox.transport;
  }
  sandbox.table?.dispose();
  const table = new SandboxTable(start, seat);
  table.open();
  sandbox.table = table;
  const transport = storyTransport(seat as Viewer['viewerSeat'], table.frame().snapshot, {
    admitView: () => sandbox.table!.frame(),
    logEntries: () => sandbox.table!.log(),
    receive: (message) => sandbox.table!.receive(message as Message),
  });
  /* Answers leave after the message that caused them, as they do from a socket. */
  table.deliver = (message) => queueMicrotask(() => transport.connected() && transport.deliver(message));
  const dispose = transport.dispose;
  sandbox.transport = {
    ...transport,
    dispose() {
      sandbox.table?.dispose();
      dispose();
      sandbox.transport = undefined;
    },
  };
  return sandbox.transport;
}

/** Starts the table again from a step, on the connection the page already holds. */
function restart(start: number, seat: string) {
  const deliver = sandbox.table?.deliver;
  sandbox.table?.dispose();
  const table = new SandboxTable(start, seat);
  table.open();
  if (deliver) {
    table.deliver = deliver;
  }
  sandbox.table = table;
  table.deliver(table.frame());
}

type SandboxArgs = { step?: number; seat?: string };

/** The panel over the page: where the table started, the seat it is viewed as, and a way back to the start. */
function SandboxPanel({
  start,
  seat,
  onStart,
  onSeat,
}: Readonly<{ start: number; seat: string; onStart: (start: number) => void; onSeat: (seat: string) => void }>) {
  const step = journeySteps()[start]!;
  return (
    <aside className={`${styles.panel} ${styles.bottomLeft}`} aria-label="Sandbox">
      <header className={styles.header}>
        <strong className={styles.code}>{stepCode(start)}</strong>
        <span className={styles.title}>Sandbox from {step.title}</span>
        <button type="button" onClick={() => onStart(start)}>
          Restart
        </button>
      </header>
      <p className={styles.detail}>
        The live table, started from this journey step. Move pieces, draw cards, change phases and fight battles as any
        seat; Restart puts the table back.
      </p>
      <div className={styles.row}>
        <label className={styles.seat}>
          <span>Start from</span>
          <select value={start} onChange={(event) => onStart(Number(event.currentTarget.value))}>
            {sandboxSteps().map((index) => (
              <option key={index} value={index}>
                {stepCode(index)} {journeySteps()[index]!.title}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.seat}>
          <span>Viewing as</span>
          <select value={seat} onChange={(event) => onSeat(event.currentTarget.value)}>
            {journeyViewers().map((viewer) => (
              <option key={viewer} value={viewer}>
                {viewer === 'neutral' ? 'Spectator' : `Seat ${viewer.slice('seat-'.length)}`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}

/** Renders the page with the sandbox panel beside it; a new start or seat, from the panel, the Controls addon or the URL, reaches the table. */
export const sandboxDecorator: Decorator = (Story, context) => (
  <SandboxFrame storyId={context.id} args={context.args as SandboxArgs}>
    <Story />
  </SandboxFrame>
);

function SandboxFrame({
  storyId,
  args,
  children,
}: Readonly<{ storyId: string; args: SandboxArgs; children: ReactNode }>) {
  const argStart = clampStart(Number(args.step ?? 1) - 1);
  const argSeat = args.seat ?? 'seat-1';
  const [{ start, seat }, setShown] = useState({ start: argStart, seat: argSeat });
  useEffect(() => setShown({ start: argStart, seat: argSeat }), [argStart, argSeat]);
  const shown = useRef({ start, seat });
  useEffect(() => {
    const previous = shown.current;
    shown.current = { start, seat };
    if (previous.start !== start) {
      restart(start, seat);
    } else if (previous.seat !== seat) {
      sandbox.table?.viewAs(seat);
    }
  }, [start, seat]);
  const change = (next: { start?: number; seat?: string }) => {
    /* Restart on the step already shown starts the table over all the same. */
    if (next.start === start) {
      restart(start, seat);
      return;
    }
    setShown((current) => ({ ...current, ...next }));
    addons.getChannel().emit(UPDATE_STORY_ARGS, {
      storyId,
      updatedArgs: {
        ...(next.start === undefined ? {} : { step: next.start + 1 }),
        ...(next.seat === undefined ? {} : { seat: next.seat }),
      },
    });
  };
  return (
    <>
      {children}
      <SandboxPanel
        start={start}
        seat={seat}
        onStart={(next) => change({ start: next })}
        onSeat={(next) => change({ seat: next })}
      />
    </>
  );
}
