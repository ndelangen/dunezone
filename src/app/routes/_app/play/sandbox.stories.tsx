import preview from '@sb/preview';
import { POINTER_TOKEN_TYPE } from '@shared/play/pointerToken';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '@shared/play/tablePhysics';
import { expect, within } from 'storybook/test';

import type { StoredSnapshot } from '../../../../../workers/game/state';
import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { sandbox, sandboxReady, sandboxSteps, sandboxTransport } from './sandbox.stories.fixture';
import { shown, piece } from './sandbox.stories.fixture';

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
  const plate = () => piece((candidate) => candidate.stackKey === 'token:sandbox-hms');
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

/** Three tech tokens for seat 1's faction set down on the board where nothing stands: one face up, one face down and a stack of three. */
function withTechTokens(stored: StoredSnapshot): StoredSnapshot {
  const seat = stored.roster!.seats.find((entry) => entry.id === 'seat-1')!;
  /* The faction's own token art stands in for a tech token's face, cut to the gear as a published one is. */
  const art = stored.table.pieces.find((candidate) => candidate.stackKey === `faction-token:${seat.faction!.id}`)!
    .items[0]!.artwork!;
  const pieces = [...stored.table.pieces];
  const versions = { ...stored.versions };
  for (const [index, [count, faceUp, x]] of (
    [
      [1, true, -0.6],
      [1, false, 0],
      [3, true, 0.6],
    ] as const
  ).entries()) {
    const token: StoredSnapshot['table']['pieces'][number] = {
      id: `sandbox-tech-${index}`,
      label: 'Karama tech',
      owner: seat.faction!.id,
      color: seat.faction!.color,
      accent: '#ead9bb',
      items: Array.from({ length: count }, (_, item) => ({
        id: `sandbox-tech-${index}-${item}`,
        faceUp,
        artwork: { front: art.front, back: art.back, name: 'Karama tech', type: 'token-tech' },
      })),
      stackKey: `token:sandbox-tech-${index}`,
      position: [0, 0, 0],
      orientation: 0.3 * index,
      zoneId: null,
      locked: false,
      kind: 'force',
    };
    const spot = nearestCollisionFreePosition(token, [x, 0, 1.6], pieces)!;
    token.position = restingPositionAt(spot, token);
    pieces.push(token);
    versions[token.id] = stored.revision;
  }
  return { ...stored, table: { ...stored.table, pieces }, versions };
}

/**
 * Tech tokens on the table are cut to the same ten-tooth gear as everywhere else they show, with their art printed on the gear.
 * By hand: hover a gear to see it pick up only over its teeth, lift one to see its shadow, and press F while holding it to turn it over.
 */
export const TechTokensAreGears = meta.story({
  args: { step: chapter('Shipment and Movement'), seat: 'seat-1' },
  beforeEach: ({ args }: { args: { step?: number; seat?: string } }) =>
    install(() =>
      sandboxTransport({
        start: Number(args.step ?? 1) - 1,
        seat: String(args.seat ?? 'seat-1'),
        prepare: withTechTokens,
      })
    )(),
  play: async ({ canvasElement }) => {
    await sandboxReady(within(canvasElement.ownerDocument.body));
    const tech = shown().table.pieces.filter((candidate) => candidate.items[0]?.artwork?.type === 'token-tech');
    await expect(tech.map((candidate) => candidate.items.length)).toEqual([1, 1, 3]);
  },
});
