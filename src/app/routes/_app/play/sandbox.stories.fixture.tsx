import { debuggingChanged, describeDebugging, note } from '@sb/playDebugger/preview';
import type { LogEntry, LogTab } from '@shared/play/log';
import type { Viewer } from '@shared/play/protocol';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '@shared/play/tablePhysics';
import { isTechToken } from '@shared/play/techToken';
import type { within } from 'storybook/test';
import { expect } from 'storybook/test';

import { onCurrentBoard } from '../../../../../workers/game/boardLayoutSnapshot';
import { storedSnapshotSchema } from '../../../../../workers/game/state';
import type { StoredSnapshot } from '../../../../../workers/game/state';
import { LocalTable } from '../tutorial/table/localTable';
import type { TableMessage } from '../tutorial/table/localTable';
import recording from './journey.recording/journey.json';
import { journeySteps, journeyViewers, stepCode, timelineSteps, viewerLabel } from './journey.stories.fixture';
import { capturedFactions } from './product.stories.fixture';
import dreamrulesTechTokens from './product.stories.fixture/dreamrules-tech-tokens.json';
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

/** How the live table looks in the Play debugger panel: where it started, the seat it is viewed as, the room's own state and a restart. */
function describeSandbox() {
  const steps = journeySteps();
  describeDebugging({
    title: 'Live table',
    description:
      "The game Worker's own table running in the browser, started from the room's stored state at a journey step. Pieces move, cards draw, phases change and battles resolve as the Worker decides. Drafting, seats, removal votes, the result and the log stay as recorded.",
    timeline: () => {
      const table = sandbox.table!;
      return {
        label: 'Start from',
        steps: timelineSteps(),
        reachable: sandboxSteps(),
        current: table.start,
        viewers: journeyViewers().map((id) => ({ id, label: viewerLabel(steps[table.start]!, id) })),
        viewer: table.seat,
        stepArg: 'step',
        viewerArg: 'seat',
      };
    },
    inspect: () => ({ Room: sandbox.table!.room.snapshot, 'Last refusal': sandbox.table!.refusal ?? null }),
    actions: [
      {
        id: 'restart',
        label: 'Restart',
        description: 'Starts the table again from its journey step, on the connection the page already holds.',
        run: () => restart({ start: sandbox.table!.start, seat: sandbox.table!.seat }),
      },
    ],
  });
}

/**
 * Starts a sandbox at a journey step (0-based) viewed as a seat, and the scripted transport around it.
 * Storybook runs a story's `beforeEach` again on every change of its arguments without unmounting the page, so a page already connected keeps its transport: a new start restarts the table on it, a new seat views it as that seat.
 */
export function sandboxTransport(place: SandboxStart) {
  if (sandbox.transport?.connected()) {
    const table = sandbox.table!;
    if (table.start !== clampStart(place.start)) {
      restart(place);
    } else if (table.seat !== place.seat) {
      note(`Viewing as ${place.seat}`);
      table.viewAs(place.seat);
    }
    debuggingChanged();
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
  describeSandbox();
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
  note(`Started from ${stepCode(table.start)} as ${table.seat}`);
  table.deliver(table.frame());
}

/** Waits for the page to show the sandbox's game. */
export async function sandboxReady(page: ReturnType<typeof within>) {
  await expect(
    page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
}

/** What the page is shown of the room right now, in the ids it sends back. */
export const shown = () => sandbox.table!.frame().snapshot;

/** A table piece as the page sees it, by what it is. */
export const piece = (match: (candidate: { kind: string; stackKey?: string | null }) => boolean) =>
  shown().table.pieces.find((candidate) => !candidate.inventory && match(candidate))!;

/**
 * The Dreamrules tech tokens in the shared table inventory, as setup deals them from the ruleset's tech token bundle.
 * The ones named in `drawn` lie face up on the board instead, as a draw would leave them, so a capture never depends on chance.
 */
export function withTechTokens(stored: StoredSnapshot, drawn: readonly string[] = []): StoredSnapshot {
  const pieces = stored.table.pieces.filter((candidate) => !isTechToken(candidate));
  const versions = { ...stored.versions };
  for (const token of dreamrulesTechTokens.tokens) {
    const art = new URL(`/play-fixtures/dreamrules/${token.published.file}`, location.origin).href;
    const id = `dreamrules-tech-${token.slug}`;
    const piece: StoredSnapshot['table']['pieces'][number] = {
      id,
      label: token.name,
      kind: 'force',
      owner: 'shared',
      inventory: 'shared',
      color: '#d5ba8c',
      accent: '#ead9bb',
      /* The bundle prints every back the same as its front. */
      items: [{ id: `${id}-1`, faceUp: true, artwork: { front: art, back: art, name: token.name, type: token.type } }],
      stackKey: `token:${token.assetId}`,
      position: [-25, 0, -25],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
    if (drawn.includes(token.slug)) {
      piece.inventory = undefined;
      piece.position = restingPositionAt(nearestCollisionFreePosition(piece, [-1.4, 0, -1.6], pieces)!, piece);
    }
    pieces.push(piece);
    versions[id] = stored.revision;
  }
  return { ...stored, table: { ...stored.table, pieces }, versions };
}
