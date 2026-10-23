import type { LogEntry, LogTab } from '@shared/play/log';
import type { Viewer } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { UPDATE_STORY_ARGS } from 'storybook/internal/core-events';
import { addons } from 'storybook/preview-api';

import { onCurrentBoard } from '../../../../../workers/game/boardLayoutSnapshot';
import { storedSnapshotSchema } from '../../../../../workers/game/state';
import type { StoredSnapshot } from '../../../../../workers/game/state';
import { LocalTable } from '../tutorial/table/localTable';
import type { TableMessage } from '../tutorial/table/localTable';
import recording from './journey.recording/journey.json';
import { journeySteps, journeyViewers, stepCode } from './journey.stories.fixture';
import styles from './journey.stories.module.css';
import { capturedFactions } from './product.stories.fixture';
import { storyTransport } from './storyTransport';

/*
 * The Play sandbox: the game Worker's own table (`Room`) running in the browser, started from the room's stored state at
 * a recorded journey step. Pieces move, cards draw, phases change and battles resolve exactly as the Worker decides, for
 * whichever seat the page is viewed as. Drafting, seats, removal votes, the result and the log stay as recorded: those
 * live in the Worker's session and storage, which the sandbox does not run.
 */

/**
 * Where a sandbox starts: a journey step (0-based) and the seat the page is viewed as.
 * `prepare` changes the stored table before it opens, as a story trying out a piece the recording never had.
 */
export type SandboxStart = { start: number; seat: string; prepare?: (stored: StoredSnapshot) => StoredSnapshot };

/** The steps the sandbox can start from: those the recording kept the room's stored state for, setup onwards. */
export function sandboxSteps(): number[] {
  return journeySteps().flatMap((step, index) => (step.stored ? [index] : []));
}

const clampStart = (index: number) => {
  const steps = sandboxSteps();
  return steps.includes(index) ? index : (steps.find((candidate) => candidate >= index) ?? steps.at(-1)!);
};

/* The fixture faces a peek can tell apart: the story Traitor fronts, each a different leader. */
const VARIED_FRONTS = [
  ...[0, 1, 2, 3, 4].map((index) => `house-atreides-traitor-${index}`),
  ...[0, 1, 2, 3].map((index) => `house-harkonnen-traitor-${index}`),
];

/*
 * The recording's Treachery deck is all Snooper cards, so a peek through it shows one face over and over.
 * The sandbox gives its hidden Treachery cards story faces that differ, so rearranging and pulling a card out can be seen.
 */
function variedTreachery(stored: StoredSnapshot): StoredSnapshot {
  let next = 0;
  const vary = (item: StoredSnapshot['table']['pieces'][number]['items'][number]) => {
    const front = item.artwork?.front;
    if (!front?.endsWith('/dreamrules/snooper.jpg') || item.faceUp) {
      return item;
    }
    const face = VARIED_FRONTS[next++ % VARIED_FRONTS.length]!;
    return {
      ...item,
      artwork: { ...item.artwork!, front: front.replace('dreamrules/snooper.jpg', `product/${face}.jpg`), name: face },
    };
  };
  return {
    ...stored,
    table: {
      ...stored.table,
      pieces: stored.table.pieces.map((piece) => ({ ...piece, items: piece.items.map(vary) })),
    },
  };
}

/** The live table of a sandbox story, started from a recorded journey step. */
export class SandboxTable extends LocalTable {
  /** The journey step the table started from. */
  readonly start: number;
  readonly prepare: SandboxStart['prepare'];

  constructor({ start, seat, prepare }: SandboxStart) {
    const index = clampStart(start);
    const step = journeySteps()[index]!;
    const recorded = variedTreachery(storedSnapshotSchema.parse(onCurrentBoard(step.stored)));
    /* Every viewer the recording connected, each with a connection of its own so carries keep their owners apart. */
    const last = journeySteps().at(-1)!.views;
    const viewers = Object.fromEntries(
      journeyViewers().map((id) => {
        const viewer = (step.views[id] ?? last[id]!).viewer;
        return [id, { ...viewer, connectionId: `sandbox-${id}` }];
      })
    );
    const view = step.views['seat-1']!.snapshot;
    const { log } = recording as unknown as { log: Record<LogTab, LogEntry[]> };
    super({
      stored: prepare ? storedSnapshotSchema.parse(prepare(recorded)) : recorded,
      viewers,
      players: view.controls?.players ?? [],
      removalVotes: view.removalVotes,
      log: { game: log.game.filter((entry) => entry.sequence <= step.logSequence), audit: log.audit },
      seat,
    });
    this.start = index;
    this.prepare = prepare;
  }
}

/** What the story shows: the live table and the transport the page is connected through. */
export const sandbox: { table?: SandboxTable; transport?: ReturnType<typeof storyTransport> } = {};

/**
 * Starts a sandbox at a journey step (0-based) viewed as a seat, and the scripted transport around it.
 * Storybook runs a story's `beforeEach` again on every change of its arguments, so a page already connected keeps its transport;
 * the panel moves the table itself.
 */
export function sandboxTransport(place: SandboxStart) {
  if (sandbox.transport?.connected()) {
    return sandbox.transport;
  }
  sandbox.table?.dispose();
  const table = new SandboxTable(place);
  table.open();
  sandbox.table = table;
  const transport = storyTransport(table.seat as Viewer['viewerSeat'], table.frame().snapshot, {
    factions: capturedFactions(),
    admitView: () => sandbox.table!.frame(),
    logEntries: () => sandbox.table!.log(),
    receive: (message) => sandbox.table!.receive(message as TableMessage),
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
function restart(place: SandboxStart) {
  const deliver = sandbox.table?.deliver;
  sandbox.table?.dispose();
  const table = new SandboxTable({ prepare: sandbox.table?.prepare, ...place });
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
  const [previousArgs, setPreviousArgs] = useState({ position: argStart, seat: argSeat });
  if (previousArgs.position !== argStart || previousArgs.seat !== argSeat) {
    setPreviousArgs({ position: argStart, seat: argSeat });
    setShown({ start: argStart, seat: argSeat });
  }
  const shown = useRef({ start, seat });
  useEffect(() => {
    const previous = shown.current;
    shown.current = { start, seat };
    if (previous.start !== start) {
      restart({ start, seat });
    } else if (previous.seat !== seat) {
      sandbox.table?.viewAs(seat);
    }
  }, [start, seat]);
  const change = (next: { start?: number; seat?: string }) => {
    /* Restart on the step already shown starts the table over all the same. */
    if (next.start === start) {
      restart({ start, seat });
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
