import { expect, test } from 'vite-plus/test';

import { retainedArrakisBoard } from '../../src/shared/boards/geometry';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { footprintReach } from '../../src/shared/play/tablePhysics';
import { fitsInside, innermostPoint, tableTerritories } from '../../src/shared/play/territoryFit';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

const player = {
  connectionId: 'hand-connection',
  userId: 'hand-player',
  viewerSeat: 'atreides',
  displayName: 'Atreides',
  color: '#75d8a7',
};

test('a leader played from hand into a territory packs around a stack another player is carrying, and their carry still lands', () => {
  const snapshot = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  const troops = snapshot.table.pieces.find((piece) => piece.kind === 'force' && !piece.inventory && !piece.locked)!;
  const basin = tableTerritories(retainedArrakisBoard()).find((territory) => territory.name === 'Imperial basin')!;
  const [x, z] = innermostPoint(basin);
  const placed = { ...troops, position: restingPositionAt([x, 0, z], troops) };
  const leader = {
    ...troops,
    id: 'hand-leader',
    owner: 'atreides',
    stackKey: 'leader:atreides',
    items: [{ id: 'hand-leader-item', faceUp: true }],
  };
  const table = new Room(
    {
      ...snapshot,
      table: { ...snapshot.table, pieces: [placed] },
      factionInventories: { ...snapshot.factionInventories, atreides: [leader] },
    },
    () => ['atreides', 'harkonnen'],
    (userId) => (userId === player.userId ? 'atreides' : undefined)
  );
  const carrier = { ...player, connectionId: 'carrier', userId: 'carrier', viewerSeat: 'harkonnen' };
  table.begin(carrier, {
    carryId: 'held',
    sourcePieceId: placed.id,
    expectedVersion: table.snapshot.versions[placed.id],
    pickup: 'whole',
  });
  table.accept(table.command(player, { kind: 'hand-play', pieceId: leader.id, position: [x, 0, z] }, 0, Date.now()));
  const carried = table.snapshot.table.pieces.find((piece) => piece.id === placed.id)!;
  /* The carried stack is neither shifted nor left locked; the leader found room around it. */
  expect(carried.position).toEqual(placed.position);
  expect(carried.locked).toBe(placed.locked);
  expect(table.snapshot.table.pieces).toHaveLength(2);
  const played = table.snapshot.table.pieces.find((piece) => piece.id !== placed.id)!;
  expect(fitsInside(basin, [played.position[0], played.position[2]], footprintReach(played))).toBe(true);
  expect(() => table.drop(carrier, 'held', { position: [x, 0.38, z], orientation: 0 })).not.toThrow();
});
