/* @vitest-environment jsdom */
import { CENTER, RADIUS, retainedArrakisBoard } from '@shared/boards/geometry';
import { propertyId } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { nextToMove, movementOrder } from '@shared/play/movement';
import type { PieceAction } from '@shared/play/protocol';
import { stormOrder } from '@shared/play/stormSector';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { tutorialSpiceBlows } from '../../../../../../scripts/lib/tutorialSpiceBlows';
import catalogue from '../setup/catalogue.json';
import setup from '../setup/setup.json';
import spiceBlows from '../setup/spiceBlows.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from '../table/localTable';
import type { GuideTask } from '../TutorialGuide';
import type { TablePlayers } from './chapterScript';
import { whatGoesWhere } from './whatGoesWhere';
import { spiceBlow } from './whatGoesWhereBoard';

vi.mock('../table/nodeCrypto', async (original) => ({ ...(await original<object>()), randomInt: () => 5 }));

let table: LocalTable;
let steps: GuideTask[];
let sequence = 0;
const snapshot = () => table.frame().snapshot;
const act = (action: PieceAction, seat = table.seat) =>
  table.receive(
    {
      type: 'command',
      commandId: `command-${++sequence}`,
      action,
      expectedRevision: table.room.snapshot.revision,
    },
    seat
  );
const point = (name: string): Vector3Tuple => {
  const board = retainedArrakisBoard();
  const face = boardTerritories(board).find(
    (face) =>
      board.properties[face.key]!.name.toLowerCase() === name.toLowerCase() ||
      propertyId(board.properties[face.key]!) === name
  )!;
  return [
    ((face.center[0] - CENTER[0]) / RADIUS) * BOARD_RADIUS,
    0.132,
    ((face.center[1] - CENTER[1]) / RADIUS) * BOARD_RADIUS,
  ];
};
const drop = (piece: TablePiece, position: Vector3Tuple, pickup: 'top' | 'whole' = 'whole') => {
  const carryId = `carry-${++sequence}`;
  table.receive({
    type: 'begin',
    carryId,
    sourcePieceId: piece.id,
    expectedVersion: snapshot().versions[piece.id] ?? 0,
    pickup,
  });
  table.receive({ type: 'drop', commandId: `drop-${++sequence}`, carryId, position, orientation: 0 });
  expect(table.refusal).toBeUndefined();
};
const check = (id: string) => {
  const task = steps.find((task) => task.id === id)!;
  const baseline = task.begin({ camera: null });
  return { done: () => task.done(baseline, { camera: null }), finish: () => task.finish?.(baseline) };
};

const spiceDeck = () =>
  snapshot().table.pieces.find((piece) => piece.position[0] > 0 && piece.stackKey?.startsWith('deck:'))!;
const singleSpiceCard = () =>
  snapshot().table.pieces.find(
    (piece) => piece.kind === 'card' && piece.items.length === 1 && piece.items[0]?.artwork?.backName === 'Spice'
  )!;
const spiceStack = (count?: number) =>
  snapshot().table.pieces.find(
    (piece) => piece.stackKey === 'spice' && (count === undefined || piece.items.length === count)
  )!;

beforeEach(async () => {
  table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
  const players: TablePlayers = {
    act: (seat, action) => act(action, seat),
    viewOf: (seat) => table.frame(seat).snapshot,
    others: () => table.seats().filter((seat) => seat !== table.seat),
    landings: () => table.landings(),
    acceptedActions: () => table.acceptedActions(),
    pings: () => table.pings(),
    captured: () => undefined,
    capturedPieces: () => [],
  };
  steps = whatGoesWhere.tasks(snapshot, players);
  await vi.dynamicImportSettled();
});
afterEach(() => table.dispose());

test('the shipped spice lookup contains exactly the recorded cards and their printed values', () => {
  expect(spiceBlows).toEqual(tutorialSpiceBlows(catalogue.assetSupply['deck/dreamrules-spice-deck']));
});

test('only an accepted random storm placement completes the storm task', () => {
  const task = check('storm');
  act({ kind: 'storm', direction: 1 });
  expect(task.done()).toBe(false);
  for (let step = 0; step < 18 && snapshot().table.stormSectorIndex !== 5; step++) {
    act({ kind: 'storm', direction: 1 });
  }
  act({ kind: 'storm-random' });
  expect(snapshot().table.stormSectorIndex).toBe(5);
  expect(task.done()).toBe(true);
});

test('requires all twenty Harkonnen troops, including reserves, in the Tanks', () => {
  const task = check('fill-tanks');
  const harkonnen = snapshot().roster!.seats.find((seat) => seat.faction?.name === 'House Harkonnen')!.faction!.id;
  const troops = () => snapshot().table.pieces.filter((piece) => piece.stackKey?.startsWith(`troops:${harkonnen}:`));
  expect(troops().flatMap((piece) => piece.items)).toHaveLength(20);
  drop(troops()[0]!, [-1, 0.132, 7]);
  expect(task.done()).toBe(false);
  drop(
    troops().find((piece) => piece.position[2] < 4)!,
    [1, 0.132, 7]
  );
  expect(task.done()).toBe(true);
});

test('deleting the last Harkonnen stack does not stand in for moving it to the Tanks', () => {
  const task = check('fill-tanks');
  const troops = snapshot().table.pieces.filter((piece) => piece.label === 'House Harkonnen troops');
  drop(troops[0]!, [-1, 0.132, 7]);
  act({ kind: 'delete', pieceId: troops[1]!.id });
  expect(task.done()).toBe(false);
});

test('the revealed card requires the indicated bank spice in its territory', () => {
  const flip = check('spice');
  expect(spiceBlow(spiceDeck())).toBeUndefined();
  drop(spiceDeck(), [6.72, 0.132, 0], 'top');
  expect(spiceBlow(singleSpiceCard())).toBeUndefined();
  act({ kind: 'flip', pieceId: singleSpiceCard().id });
  expect(flip.done()).toBe(true);
  const blow = spiceBlow(singleSpiceCard())!;
  expect(blow).toBeDefined();
  const place = check('place-spice');
  act({ kind: 'spice-spawn', count: blow.amount - 1 });
  drop(spiceStack(), point(blow.territory));
  expect(place.done()).toBe(false);
  act({ kind: 'spice-spawn', count: 1 });
  drop(spiceStack(1), point('Cielago South'));
  expect(place.done()).toBe(false);
  drop(spiceStack(1), point(blow.territory));
  expect(place.done()).toBe(true);
});

test('preceding factions finish, then the learner ships, moves territories and marks done', () => {
  for (let index = 0; index < 5; index++) {
    act({ kind: 'phase' });
  }
  const orderTask = check('movement-order');
  const view = snapshot();
  const mine = view.bank!.factionId;
  const order = movementOrder(stormOrder(view.table.stormSectorIndex, view.roster, view.table.pieces), view.movement);
  expect(nextToMove(order, view.movement)).toBe(mine);
  orderTask.finish();
  const troops = () => snapshot().table.pieces.filter((piece) => piece.stackKey?.startsWith(`troops:${mine}:`));
  const ship = check('ship');
  const reserves = troops().find((piece) => Math.hypot(piece.position[0], piece.position[2]) > BOARD_RADIUS)!;
  drop(reserves, point('Habbanya Ridge Flat'));
  expect(ship.done()).toBe(true);
  const move = check('move');
  const shipped = troops().find((piece) => piece.items.length === reserves.items.length)!;
  drop(shipped, [shipped.position[0] + 0.05, shipped.position[1], shipped.position[2]]);
  expect(move.done()).toBe(false);
  drop(
    troops().find((piece) => piece.items.length === reserves.items.length)!,
    point('Cielago South')
  );
  expect(move.done()).toBe(true);
  const done = check('movement-done');
  expect(done.done()).toBe(false);
  act({ kind: 'movement-done', factionId: mine });
  expect(done.done()).toBe(true);
});
