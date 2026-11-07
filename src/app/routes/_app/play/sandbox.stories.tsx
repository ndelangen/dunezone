import preview from '@sb/preview';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import type { TablePiece } from '@shared/play/model';
import { isPointerToken, POINTER_TOKEN_TYPE } from '@shared/play/pointerToken';
import { revealedSpiceBlows } from '@shared/play/spiceBlowPlacement';
import { restingPositionAt, troopScale } from '@shared/play/tableGeometry';
import { footprintReach, nearestCollisionFreePosition, piecesOverlapAt } from '@shared/play/tablePhysics';
import { drawableTechTokens, isTechToken } from '@shared/play/techToken';
import {
  DEFAULT_SECTOR_LINE_MARGIN,
  fitsInside,
  innermostPoint,
  setSectorLineMargin,
  tableTerritories,
} from '@shared/play/territoryFit';
import { packsInTerritory, territoryLanding, withNudges } from '@shared/play/territoryPlacement';
import { expect, within } from 'storybook/test';

import type { StoredSnapshot } from '../../../../../workers/game/state';
import { dragBattleMarker } from './battles.marker.stories.fixture';
import { openControl } from './controls.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import {
  messyReservesSandbox,
  piece,
  sandbox,
  sandboxReady,
  sandboxSteps,
  sandboxTransport,
  shown,
  withCoveredSpiceBlow,
  withSpiceBlows,
  withTechTokens,
} from './sandbox.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Sandbox',
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Bidding'), seat: 'seat-1' },
  argTypes: {
    step: {
      control: { type: 'range', min: sandboxSteps()[0]! + 1, max: sandboxSteps().at(-1)! + 1, step: 1 },
    },
    seat: { control: 'select', options: journeyViewers() },
  },
  parameters: {
    ...gameMeta.parameters,
    docs: {
      description: {
        component:
          "The game Worker's own table running in the browser, started from the room's stored state at a step of Play/Journey (J13 onwards). Drag pieces, draw cards, change phases and fight battles as any seat; the Play debugger panel switches seats and restarts the table. Drafting, seats, votes, the result and the log stay as recorded.",
      },
    },
  },
  beforeEach: ({ args }) =>
    install(() => sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') }))(),
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/**
 * Seat 1 lifts the top card off the Treachery deck and turns it over in hand: every seat sees its face while it is held, and it lands face up with the flip in the table's events.
 * Pick up a card, token or troop stack and press F while still holding it to try it by hand;
 * markers and spice do not turn over.
 */
export const FlipWhileCarrying = meta.story({
  play: async ({ canvasElement }) => {
    await sandboxReady(within(canvasElement.ownerDocument.body));
    const table = sandbox.table!;
    const deck = piece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    const other = journeyViewers().find((seat) => seat !== table.seat)!;
    const position: [number, number, number] = [0, 0.4, 1.5];
    table.receive({
      type: 'begin',
      carryId: 'sandbox-flip',
      sourcePieceId: deck.id,
      expectedVersion: shown().versions[deck.id]!,
      pickup: 'top',
    });
    table.receive({ type: 'pose', carryId: 'sandbox-flip', seq: 1, position, orientation: 0 });
    table.receive({ type: 'flip', carryId: 'sandbox-flip', flips: 1 });
    await expect(table.refusal).toBeUndefined();
    const held = table.frame(other).carries[0]!.held;
    await expect(held.items[0]).toMatchObject({ faceUp: true, artwork: { front: expect.any(String) } });

    table.receive({
      type: 'drop',
      commandId: 'sandbox-flip-drop',
      carryId: 'sandbox-flip',
      position,
      orientation: 0,
      flips: 1,
    });
    await expect(table.refusal).toBeUndefined();
    const landed = table
      .frame(other)
      .snapshot.table.pieces.find((candidate) => candidate.items[0]?.id === held.items[0]!.id)!;
    await expect(landed.items[0]?.faceUp).toBe(true);
    await expect(
      shown()
        .table.events.slice(0, 2)
        .map((event) => event.command)
    ).toEqual(['deck.draw', 'piece.flip']);
  },
});

/** An HMS plate for seat 1's faction, set down on the board where nothing stands. */
function withHms(stored: StoredSnapshot): StoredSnapshot {
  const seat = stored.roster!.seats.find((entry) => entry.id === 'seat-1')!;
  /* The faction's own token art stands in for a pointer token's face. */
  const art = stored.table.pieces.find((candidate) => candidate.stackKey === `faction-token:${seat.faction!.id}`)!
    .items[0]!.artwork!;
  const plate: StoredSnapshot['table']['pieces'][number] = {
    id: 'sandbox-hms',
    label: 'HMS',
    owner: seat.faction!.id,
    color: seat.faction!.color,
    accent: '#ead9bb',
    items: [
      {
        id: 'sandbox-hms-plate',
        faceUp: true,
        artwork: { front: art.front, back: art.back, name: 'HMS', type: POINTER_TOKEN_TYPE },
      },
    ],
    stackKey: 'token:sandbox-hms',
    position: [0, 0, 0],
    orientation: 0.5,
    zoneId: null,
    locked: false,
    kind: 'force',
  };
  const spot = nearestCollisionFreePosition(plate, [0.6, 0, 1.6], stored.table.pieces)!;
  plate.position = restingPositionAt(spot, plate);
  return {
    ...stored,
    table: { ...stored.table, pieces: [...stored.table.pieces, plate] },
    versions: { ...stored.versions, [plate.id]: stored.revision },
  };
}

/** Seat 1 sets two of its troop stacks on the HMS; answers the stacks and the plate as the page sees them. */
async function boardHms(canvasElement: HTMLElement) {
  await sandboxReady(within(canvasElement.ownerDocument.body));
  const table = sandbox.table!;
  const faction = shown().bank!.factionId;
  const plate = () => shown().table.pieces.find(isPointerToken)!;
  const carry = async (id: string, pieceId: string, position: [number, number, number], orientation = 0) => {
    table.receive({
      type: 'begin',
      carryId: id,
      sourcePieceId: pieceId,
      expectedVersion: shown().versions[pieceId]!,
      pickup: 'whole',
    });
    table.receive({ type: 'drop', commandId: `${id}-drop`, carryId: id, position, orientation });
    await expect(table.refusal).toBeUndefined();
  };
  const stacks = shown()
    .table.pieces.filter(
      (candidate) =>
        !candidate.inventory && candidate.kind === 'force' && !!candidate.stackKey?.startsWith(`troops:${faction}:`)
    )
    .slice(0, 2);
  const [x, , z] = plate().position;
  await carry('hms-first', stacks[0]!.id, [x - 0.2, 0.4, z + 0.1]);
  await carry('hms-second', stacks[1]!.id, [x + 0.2, 0.4, z - 0.1]);
  const riding = () => shown().table.pieces.filter((candidate) => stacks.some((stack) => stack.id === candidate.id));
  return { plate, carry, riding };
}

const hmsSandbox = {
  args: { step: chapter('Shipment and Movement'), seat: 'seat-1' },
  beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
    install(() =>
      sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1'), prepare: withHms })
    )(),
};

/**
 * Seat 1 moves the HMS across the board with two troop stacks on it: both ride along, each keeping its place on the plate.
 * By hand: drag the plate and both stacks ride along;
 * drag a stack off and it stays behind;
 * Q or E turns the plate with its troops.
 */
export const HmsCarriesItsTroops = meta.story({
  ...hmsSandbox,
  play: async ({ canvasElement }) => {
    const { plate, carry, riding } = await boardHms(canvasElement);
    const [x, , z] = plate().position;
    const before = riding().map((stack) => [stack.position[0] - x, stack.position[2] - z]);
    await carry('hms-plate', plate().id, [x - 1.6, 0.4, z - 1.2], plate().orientation);
    const [nextX, , nextZ] = plate().position;
    for (const [index, stack] of riding().entries()) {
      await expect(stack.position[0] - nextX).toBeCloseTo(before[index]![0]!);
      await expect(stack.position[2] - nextZ).toBeCloseTo(before[index]![1]!);
    }
  },
});

/**
 * The seven Dreamrules tech tokens, dealt into the shared table inventory, with Customs already drawn and lying face up on the table: a tech token is as wide as a leader disc and cut to its gear.
 * By hand: press "Draw random tech token" until the inventory is empty and the button turns off and says why;
 * lift a drawn token to see its shadow, and press F while holding it to turn it over.
 * Play/Sandbox/Draw Random Tech Token tests the draw itself.
 */
export const TechTokens = meta.story({
  args: { step: chapter('Shipment and Movement'), seat: 'seat-1' },
  beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
    install(() =>
      sandboxTransport({
        start: Number(args.step ?? 1) - 1,
        seat: String(args.seat ?? 'seat-1'),
        prepare: (stored) => withTechTokens(stored, ['customs']),
      })
    )(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await sandboxReady(page);
    await openControl(page, 'Shared table inventory');
    const tokens = shown().table.pieces.filter(isTechToken);
    await expect(drawableTechTokens(tokens)).toHaveLength(6);
    const [customs] = tokens.filter((candidate) => !candidate.inventory);
    await expect(troopScale(customs!)).toBe(troopScale({ kind: 'force', stackKey: 'leader:any' }));
    await expect(page.getByRole('button', { name: 'Draw random tech token' })).toBeEnabled();
  },
});

/* Arrakeen on the Arrakis board the sandbox plays on, and the spot in it with the most room. */
function arrakeen() {
  const territory = tableTerritories(arrakisBoardCapture.definition).find(
    (candidate) => candidate.name === 'Arrakeen'
  )!;
  const [x, z] = innermostPoint(territory);
  return { territory, x, z };
}

type Loose = { inventory?: unknown; kind: string; stackKey?: string | null };
const troopsOf = <Piece extends Loose>(pieces: readonly Piece[], faction: string) =>
  pieces.filter(
    (candidate) =>
      !candidate.inventory && candidate.kind === 'force' && !!candidate.stackKey?.startsWith(`troops:${faction}:`)
  );

/**
 * The recording set the fighters down by Arrakeen before stacks kept inside territories, so a few rest across its border.
 * This sets each loose stack within reach of the city down inside it, as a drop there lands it now.
 */
function withArrakeenPacked(stored: StoredSnapshot): StoredSnapshot {
  const { territory, x, z } = arrakeen();
  /* Only positions change, and the packing reads only the pieces' shape and place. */
  let pieces = stored.table.pieces as unknown as TablePiece[];
  const straddling = pieces.filter(
    (candidate) =>
      packsInTerritory(candidate) &&
      Math.hypot(candidate.position[0] - x, candidate.position[2] - z) < 0.9 &&
      !fitsInside(territory, [candidate.position[0], candidate.position[2]], footprintReach(candidate))
  );
  /* Set down left and right of the middle, so from the map camera the stacks stand side by side, not one behind another. */
  for (const [index, stack] of straddling.entries()) {
    const others = pieces.filter((candidate) => candidate.id !== stack.id);
    const side = index % 2 === 0 ? -0.2 : 0.2;
    const landing = territoryLanding(
      { board: arrakisBoardCapture.definition },
      stack,
      restingPositionAt([x + side, 0, z], stack),
      others
    );
    if (landing) {
      pieces = withNudges([...others, { ...stack, position: landing.position }], landing.nudges);
    }
  }
  const moved = new Map(pieces.map((piece) => [piece.id, piece.position]));
  return {
    ...stored,
    table: {
      ...stored.table,
      pieces: stored.table.pieces.map((piece) => ({ ...piece, position: moved.get(piece.id) ?? piece.position })),
    },
  };
}

/** Atreides starts in Arrakeen; a second faction joins it there, its stack beside the Atreides one. */
function withArrakeenHeld(stored: StoredSnapshot): StoredSnapshot {
  const { x, z } = arrakeen();
  const guest = stored.roster!.seats.find((seat) => seat.faction && seat.faction.id !== 'house-atreides')!;
  const stack = troopsOf(stored.table.pieces, guest.faction!.id)[0]!;
  const position = restingPositionAt([x - 0.12, 0, z + 0.2], stack);
  return {
    ...stored,
    table: {
      ...stored.table,
      pieces: stored.table.pieces.map((candidate) =>
        candidate.id === stack.id ? { ...candidate, position } : candidate
      ),
    },
  };
}

/**
 * Two factions hold Arrakeen, and a third drops a troop stack right on top of them: it lands where it was let go, the stacks already there shift over just enough to make room, and all three stay inside the city's outline.
 * By hand: drag any troop stack into a territory where others stand and watch them move over;
 * a territory with no room left refuses the drop and says so.
 */
export const TroopsMakeRoom = meta.story({
  args: { step: chapter('Shipment and Movement'), seat: 'seat-1' },
  beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
    install(() =>
      sandboxTransport({
        start: Number(args.step ?? 1) - 1,
        seat: String(args.seat ?? 'seat-1'),
        prepare: withArrakeenHeld,
      })
    )(),
  play: async ({ canvasElement }) => {
    await sandboxReady(within(canvasElement.ownerDocument.body));
    const table = sandbox.table!;
    const { territory, x, z } = arrakeen();
    const inside = (candidate: TablePiece) =>
      fitsInside(territory, [candidate.position[0], candidate.position[2]], footprintReach(candidate));
    const held = shown()
      .table.pieces.filter(inside)
      .map((candidate) => candidate.id);
    const owners = new Set(
      shown()
        .table.pieces.filter(inside)
        .map((candidate) => candidate.owner)
    );
    const faction = shown().roster!.seats.find((seat) => seat.faction && !owners.has(seat.faction.id))!.faction!.id;
    const stack = troopsOf(shown().table.pieces, faction)[0]!;
    const before = new Map(shown().table.pieces.map((candidate) => [candidate.id, candidate.position]));
    table.receive({
      type: 'begin',
      carryId: 'arrakeen',
      sourcePieceId: stack.id,
      expectedVersion: shown().versions[stack.id]!,
      pickup: 'whole',
    });
    table.receive({
      type: 'drop',
      commandId: 'arrakeen-drop',
      carryId: 'arrakeen',
      position: [x, 0.4, z],
      orientation: 0,
    });
    await expect(table.refusal).toBeUndefined();
    const city = shown().table.pieces.filter((candidate) => [...held, stack.id].includes(candidate.id));
    await expect(city).toHaveLength(3);
    await expect(city.filter((candidate) => !inside(candidate)).map(({ id }) => id)).toEqual([]);
    const overlapping = city.flatMap((candidate) =>
      city
        .filter((other) => other !== candidate && piecesOverlapAt(candidate, candidate.position, other))
        .map((other) => `${candidate.id}/${other.id}`)
    );
    await expect(overlapping).toEqual([]);
    /* The new stack rests near where it was let go: the city is nearly full, so it gives way a little as the others move over. */
    const landed = city.find((candidate) => candidate.id === stack.id)!;
    await expect(Math.hypot(landed.position[0] - x, landed.position[2] - z)).toBeLessThan(0.3);
    const shifted = city.filter((candidate) => {
      const was = before.get(candidate.id)!;
      return (
        candidate.id !== stack.id && Math.hypot(candidate.position[0] - was[0], candidate.position[2] - was[2]) > 1e-3
      );
    });
    await expect(shifted.length).toBeGreaterThan(0);
  },
});

/**
 * In the Battle phase, seat 2 carries the battle marker into Arrakeen and lets go: the game starts the battle there and names it Arrakeen.
 * The city keeps the marker's red outline while the battle lasts.
 * By hand: drag the marker from the tracker across the board, and the territory under it lights up as it moves.
 */
export const BattleMarkerLightsTerritory = meta.story({
  args: { step: chapter('Battle'), seat: 'seat-2' },
  beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
    install(() =>
      sandboxTransport({
        start: Number(args.step ?? 1) - 1,
        seat: String(args.seat ?? 'seat-2'),
        prepare: withArrakeenPacked,
      })
    )(),
  play: async ({ canvasElement }) => {
    await sandboxReady(within(canvasElement.ownerDocument.body));
    const { x, z } = arrakeen();
    await dragBattleMarker(canvasElement.ownerDocument, [x, 0.18, z], async () => {
      await expect(shown().battle).toMatchObject({ territory: 'Arrakeen', territoryId: 'arrakeen' });
      /* The fighters' stacks by the city all stand inside it, under the light. */
      const { territory } = arrakeen();
      const nearby = shown().table.pieces.filter(
        (candidate) =>
          packsInTerritory(candidate) && Math.hypot(candidate.position[0] - x, candidate.position[2] - z) < 0.9
      );
      await expect(nearby.length).toBeGreaterThan(1);
      const outside = nearby.filter(
        (stack) => !fitsInside(territory, [stack.position[0], stack.position[2]], footprintReach(stack))
      );
      await expect(outside.map(({ id }) => id)).toEqual([]);
    });
  },
});

/**
 * Seat 1, the Emperor, after a few rough turns: both reserves knocked askew behind the seat, 4 Normal troops out on the board and 2 revived ones lying face down beside the token.
 * By hand: drag any Emperor troops onto the Emperor token.
 * They join their reserve face up, and both reserves stand straight on the spots setup dealt them: in setup order at this seat, and at a seat down the side of the table the smaller stack takes the spot lower on the screen.
 * Troops dropped on another faction's token are set down as before.
 */
export const TroopsBackToReserves = meta.story({
  ...messyReservesSandbox,
  play: async ({ canvasElement }) => {
    await sandboxReady(within(canvasElement.ownerDocument.body));
    await expect(piece((candidate) => candidate.stackKey === 'faction-token:emperor')).toBeDefined();
  },
});

/* A Spice Blow story: the table just after a Spice card was turned face up, with its Spice cards captured. */
function spiceBlowStory(prepare: typeof withSpiceBlows) {
  return {
    args: { step: chapter('Spice card revealed'), seat: 'seat-1' },
    beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
      install(() =>
        sandboxTransport({
          start: Number(args.step ?? 1) - 1,
          seat: String(args.seat ?? 'seat-1'),
          prepare,
        })
      )(),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      await sandboxReady(within(canvasElement.ownerDocument.body));
    },
  };
}

/**
 * Spice Blow just after the Spice card was turned face up: Broken Land is lit on the board for as long as the card lies face up.
 * Place the spice by hand, right-click the card and choose "Place 8 spice on Broken land", or press Space and run the "Spice blow" command, which places the spice of every face-up spice card.
 * Either way can be repeated;
 * each time another 8 join the same pile.
 */
export const SpiceBlow = meta.story(spiceBlowStory(withSpiceBlows));

/**
 * A face-up Arsunt card lies under the revealed Broken Land card in the same pile.
 * Only the visible top card counts: Broken Land is lit and Arsunt is not, and both the right-click and the "Spice blow" command place 8 spice on Broken land only.
 */
export const SpiceBlowTopCardOnly = meta.story({
  ...spiceBlowStory(withCoveredSpiceBlow),
  play: async ({ canvasElement }) => {
    await sandboxReady(within(canvasElement.ownerDocument.body));
    const blows = revealedSpiceBlows(shown().table.pieces).map(({ blow }) => blow.territories);
    await expect(blows).toEqual([['broken_land']]);
  },
});

/* Where a sector line runs through a territory, by the line's number and how far out from the centre. */
const SECTOR_LINE_DROPS = [
  { line: 8, out: 2.75 },
  { line: 4, out: 2.3 },
  { line: 12, out: 2.65 },
  { line: 14, out: 1.35 },
  { line: 15, out: 3.55 },
  { line: 17, out: 1.05 },
] as const;

/* A point on a sector line, a hair to the clockwise or counterclockwise side of it. */
function onSectorLine({ line, out }: { line: number; out: number }, side: number): [number, number, number] {
  const angle = (line * Math.PI * 2) / 18;
  return [out * Math.cos(angle) - Math.sin(angle) * side, 0.4, out * Math.sin(angle) + Math.cos(angle) * side];
}

/**
 * The sandbox at Shipment and Movement, with the sector lines kept `margin` clear (null: as before, lines ignored).
 * Its play carries a troop onto six sector lines that run through territories, letting go right on each line.
 */
function sectorStory(margin: number | null) {
  return {
    args: { step: chapter('Shipment and Movement'), seat: 'seat-1' },
    beforeEach: ({ args }: { args: { step?: number; seat?: string } }) => {
      setSectorLineMargin(margin);
      const cleanup = install(() =>
        sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') })
      )();
      return () => {
        cleanup();
        setSectorLineMargin(DEFAULT_SECTOR_LINE_MARGIN);
      };
    },
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      await sandboxReady(within(canvasElement.ownerDocument.body));
      const table = sandbox.table!;
      const factions = shown()
        .roster!.seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : []))
        .filter((faction) => troopsOf(shown().table.pieces, faction).length > 0);
      for (const [index, drop] of SECTOR_LINE_DROPS.entries()) {
        const source = troopsOf(shown().table.pieces, factions[index % factions.length]!)[0]!;
        const carryId = `sector-line-${index}`;
        table.receive({
          type: 'begin',
          carryId,
          sourcePieceId: source.id,
          expectedVersion: shown().versions[source.id]!,
          pickup: 'top',
        });
        table.receive({
          type: 'drop',
          commandId: `${carryId}-drop`,
          carryId,
          position: onSectorLine(drop, index % 2 === 0 ? 0.001 : -0.001),
          orientation: 0,
        });
        await expect(table.refusal).toBeUndefined();
      }
    },
  };
}

/**
 * Before: a troop let go on a sector line rests right across it, half in each sector.
 * Six troops are let go on sector lines through the Habbanya erg, Cielago depression, Tsimpo, Imperial basin, Old gap and the Minor erg.
 */
export const SectorLinesBefore = meta.story(sectorStory(null));

/** Just clear: each troop steps into the sector it was let go in, its edge just off the line. */
export const SectorLinesJustClear = meta.story(sectorStory(0));

/** A clear gap: each troop steps into its sector and keeps a sliver of board between its edge and the line. */
export const SectorLinesClearGap = meta.story(sectorStory(DEFAULT_SECTOR_LINE_MARGIN));

/** A wide gap: each troop keeps well away from the line, about half its own radius. */
export const SectorLinesWideGap = meta.story(sectorStory(0.09));
