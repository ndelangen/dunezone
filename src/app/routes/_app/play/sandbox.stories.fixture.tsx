import { debuggingChanged, describeDebugging, note } from '@sb/playDebugger/preview';
import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { boardPointToTable } from '@shared/boards/tableTerritories';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import type { LogEntry, LogTab } from '@shared/play/log';
import type { StoredPiece } from '@shared/play/model';
import type { Viewer } from '@shared/play/protocol';
import type { SpiceBlow } from '@shared/play/spiceBlow';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '@shared/play/tablePhysics';
import { isTechToken } from '@shared/play/techToken';
import type { TreacheryDeckCard } from '@shared/play/treacheryDeck';
import { troopFactionOf } from '@shared/play/troopReserves';
import type { within } from 'storybook/test';
import { expect } from 'storybook/test';

import { storedSnapshotSchema } from '../../../../../workers/game/state';
import type { StoredSnapshot } from '../../../../../workers/game/state';
import { LocalTable } from '../tutorial/table/localTable';
import type { TableMessage } from '../tutorial/table/localTable';
import { install } from './game.stories.fixture';
import recording from './journey.recording/journey.json';
import { chapter, journeySteps, journeyViewers, stepCode, timelineSteps, viewerLabel } from './journey.stories.fixture';
import { waitForTableOpen } from './mapView.stories.fixture';
import { dreamrulesTechTokenPieces } from './panels/inventory/techTokens.stories.fixture';
import { capturedFactions } from './product.stories.fixture';
import { storyTransport } from './storyTransport';
import { dealtTroopsOf, withMessyReserves } from './troopReserves.stories.fixture';

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

/** The live table of a sandbox story, started from a recorded journey step. */
export class SandboxTable extends LocalTable {
  /** The journey step the table started from. */
  readonly start: number;
  readonly prepare: SandboxStart['prepare'];

  constructor({ start, seat, prepare }: SandboxStart) {
    const index = clampStart(start);
    const step = journeySteps()[index]!;
    const recorded = storedSnapshotSchema.parse(step.stored);
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
    /* A real game plays on its ruleset's board. */
    this.setBoard(arrakisBoardCapture);
    /* Setup dealt the reserves in the order the factions' captures list their troops, which the dealt table still shows. */
    const dealt = journeySteps()[sandboxSteps()[0]!]!;
    this.room.dealtTroops = dealtTroopsOf(storedSnapshotSchema.parse(dealt.stored));
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
export function sandboxTransport(
  place: SandboxStart,
  { treacheryDeck = null }: Readonly<{ treacheryDeck?: TreacheryDeckCard[] | null }> = {}
) {
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
    treacheryDeck,
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
  await waitForTableOpen(document);
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
  for (const piece of dreamrulesTechTokenPieces()) {
    if (drawn.some((slug) => piece.id === `dreamrules-tech-${slug}`)) {
      piece.inventory = undefined;
      piece.position = restingPositionAt(nearestCollisionFreePosition(piece, [-1.4, 0, -1.6], pieces)!, piece);
    }
    pieces.push(piece);
    versions[piece.id] = stored.revision;
  }
  return { ...stored, table: { ...stored.table, pieces }, versions };
}

/**
 * Two plain tokens standing in for Discovery tokens, face up on the board beside a troop stack, so their size and thickness read against a troop's.
 * They borrow two Dreamrules tech tokens' faces, as plain tokens rather than tech tokens.
 */
/* The live Discovery bundle's tokens, by catalogue id: two Hiereg-backed and two Smuggler-backed, as dune.zone publishes them. */
const LIVE_DISCOVERY_TOKENS = [
  { id: 'ns70ga4v7e4z4j0701kb5h8b3x8gmbn0', name: 'Cistern', back: 'ns70ga4v7e4z4j0701kb5h8b3x8gmbn0' },
  { id: 'ns78sqzwt8bjwan5nrwh2da38n8gmp91', name: 'Shrine', back: 'ns70ga4v7e4z4j0701kb5h8b3x8gmbn0' },
  { id: 'ns71am9sbvtjte3pxg1h9vcd0d8gn94n', name: 'Ornithopter', back: 'ns71am9sbvtjte3pxg1h9vcd0d8gn94n' },
  { id: 'ns7fspnt2jjyj3p1gwhtz6gmyn8gmn2r', name: 'Spice Stash', back: 'ns71am9sbvtjte3pxg1h9vcd0d8gn94n' },
] as const;

/**
 * The live Discovery tokens beside a troop stack, two face down as they are placed and two face up, so their size and thickness read against a troop's.
 * Their faces are dune.zone's published pictures, which Storybook shows when started with STORYBOOK_LIVE_PUBLISHED=1.
 */
export function withDiscoveryTokens(stored: StoredSnapshot): StoredSnapshot {
  const pieces = [...stored.table.pieces];
  const versions = { ...stored.versions };
  /* Beside the viewing seat's own troops, which sit nearest its camera. */
  const own = stored.roster?.seats.find((seat) => seat.id === 'seat-1')?.faction?.id;
  const troop =
    pieces.find((candidate) => !candidate.inventory && own !== undefined && troopFactionOf(candidate) === own) ??
    pieces.find((candidate) => candidate.kind === 'force' && candidate.stackKey?.startsWith('troop'));
  const near: [number, number, number] = troop ? [troop.position[0], 0, troop.position[2]] : [0.6, 0, 0.6];
  for (const [index, live] of LIVE_DISCOVERY_TOKENS.entries()) {
    const id = `discovery-${index + 1}`;
    const faceUp = index % 2 === 1;
    const token: StoredPiece = {
      id,
      label: live.name,
      kind: 'force',
      owner: 'shared',
      color: '#d5ba8c',
      accent: '#ead9bb',
      items: [
        {
          id: `${id}-1`,
          faceUp,
          artwork: {
            front: new URL(publishedHref('token-disc', live.id), location.origin).href,
            back: new URL(publishedHref('token-disc', `${live.back}.back`), location.origin).href,
            name: live.name,
            type: 'token-disc',
            /* Twice a troop's width, as the live tokens are authored. */
            size: 2,
          },
        },
      ],
      stackKey: `token:${live.id}`,
      position: [0, 0, 0],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
    token.position = restingPositionAt(nearestCollisionFreePosition(token, near, pieces)!, token);
    pieces.push(token);
    versions[token.id] = stored.revision;
  }
  return { ...stored, table: { ...stored.table, pieces }, versions };
}

/** The seat the recording's deal gave a faction; the deal is random, so it differs per recording. */
export const seatOf = (faction: string) =>
  journeySteps()
    .at(-1)!
    .views['seat-1']!.snapshot.roster!.seats.find((entry) => entry.faction?.id === faction)!.id;

/* The Emperor is the faction with two kinds of troops. */
const emperorSeat = () => seatOf('emperor');

/** A sandbox at Shipment and Movement as the Emperor's seat, its troops in a mess for carrying back to their reserves. */
export const messyReservesSandbox = {
  args: { step: chapter('Shipment and Movement'), seat: emperorSeat() },
  beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
    install(() =>
      sandboxTransport({
        start: Number(args.step ?? 1) - 1,
        seat: String(args.seat ?? emperorSeat()),
        prepare: (stored) => withMessyReserves(stored, 'emperor'),
      })
    )(),
};

/**
 * The recording's Spice cards as a game now captures them: each Broken Land card names its territory and its eight spice, as the published card's highlight and amount say, so its revealed face can place its spice (#2678).
 */
export function withSpiceBlows(stored: StoredSnapshot): StoredSnapshot {
  const spiceBlow = { amount: 8, territories: ['broken_land'] } satisfies SpiceBlow;
  const capture = (item: StoredSnapshot['table']['pieces'][number]['items'][number]) =>
    item.artwork?.type === 'card-spice' ? { ...item, artwork: { ...item.artwork, spiceBlow } } : item;
  return {
    ...stored,
    table: {
      ...stored.table,
      pieces: stored.table.pieces.map((candidate) => ({ ...candidate, items: candidate.items.map(capture) })),
    },
  };
}

/* The exact spot the live Broken Land card's own map puts its Spice token on (dune.zone, 2026-11-24), in board drawing units. */
const LIVE_BROKEN_LAND_SPOT: [number, number] = [158.354, 31.092];

/**
 * The recording's Spice cards with their own map's exact spot, as every live Spice card has one: the Spice token the card's author placed on Broken Land, on the board the card was drawn on.
 * The table draws the spice sticker on that spot and the card's spice lands on it.
 */
export function withPinnedSpiceBlows(stored: StoredSnapshot): StoredSnapshot {
  const spiceBlow = {
    amount: 8,
    territories: ['broken_land'],
    spots: [LIVE_BROKEN_LAND_SPOT],
    boardId: arrakisBoardCapture.asset.id,
  } satisfies SpiceBlow;
  const capture = (item: StoredSnapshot['table']['pieces'][number]['items'][number]) =>
    item.artwork?.type === 'card-spice' ? { ...item, artwork: { ...item.artwork, spiceBlow } } : item;
  return {
    ...stored,
    table: {
      ...stored.table,
      pieces: stored.table.pieces.map((candidate) => ({ ...candidate, items: candidate.items.map(capture) })),
    },
  };
}

/** The exact spot the pinned Spice cards mark, in table units. */
export const pinnedSpiceBlowSpot = () => boardPointToTable(LIVE_BROKEN_LAND_SPOT);

/**
 * The same table with a second face-up spice card, an Arsunt blow of 6, tucked under each revealed spice card.
 * Only the card on top counts, so Broken Land lights and Arsunt does not.
 */
export function withCoveredSpiceBlow(stored: StoredSnapshot): StoredSnapshot {
  const captured = withSpiceBlows(stored);
  const arsunt = { amount: 6, territories: ['arsunt'] } satisfies SpiceBlow;
  return {
    ...captured,
    table: {
      ...captured.table,
      pieces: captured.table.pieces.map((candidate) => {
        const top = candidate.items.at(-1);
        if (candidate.kind !== 'card' || !top?.faceUp || top.artwork?.type !== 'card-spice') {
          return candidate;
        }
        const under = { ...top, id: `${top.id}-under`, artwork: { ...top.artwork, name: 'Arsunt', spiceBlow: arsunt } };
        return { ...candidate, items: [...candidate.items.slice(0, -1), under, top] };
      }),
    },
  };
}
