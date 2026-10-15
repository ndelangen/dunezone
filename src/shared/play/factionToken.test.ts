import { describe, expect, test } from 'vitest';

import { factionTokenRingPose, factionTokenStackKey, sectorIndexAt } from './factionToken';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { stormOrder } from './stormSector';
import { tableSectorCenterAngle } from './tableSettings';
import { applyDraftToState, draftForGesture, projectCarryAtPosition, settleCarryAtPosition } from './tableState';

function token(factionId: string, sector: number): TablePiece {
  const base = freshTableState().pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  const pose = factionTokenRingPose(tableSectorCenterAngle(sector));
  return {
    ...base,
    id: `token-${factionId}`,
    label: `${factionId} token`,
    stackKey: factionTokenStackKey(factionId),
    items: [{ ...base.items[0]!, id: `token-item-${factionId}` }],
    position: [pose.position[0], 0.005, pose.position[2]],
    orientation: pose.orientation,
    zoneId: null,
  };
}

function tableWith(...tokens: TablePiece[]): TableState {
  return { ...freshTableState(), pieces: tokens };
}

function dropAt(state: TableState, piece: TablePiece, position: Vector3Tuple) {
  const draft = draftForGesture(piece, 'whole')!;
  const settled = settleCarryAtPosition(state, draft, position);
  return settled ? applyDraftToState(state, settled) : null;
}

const at = (state: TableState, id: string) => state.pieces.find((piece) => piece.id === id)!;

describe('faction tokens on the ring', () => {
  test('a carried token slides around the ring, facing the board, however far the pointer strays', () => {
    const state = tableWith(token('fremen', 2));
    const draft = projectCarryAtPosition(state, draftForGesture(at(state, 'token-fremen'), 'whole')!, [0.5, 0.4, 0.5])!;
    expect(Math.hypot(draft.position[0], draft.position[2])).toBeCloseTo(4.39);
    expect(Math.atan2(draft.position[2], draft.position[0])).toBeCloseTo(Math.PI / 4);
    expect(draft.orientation).toBeCloseTo(Math.PI / 2 - Math.PI / 4);
    expect(draft.targetPieceId).toBeNull();
  });

  test('set down, it settles at the centre of the sector under it', () => {
    const state = tableWith(token('fremen', 2));
    const next = dropAt(state, at(state, 'token-fremen'), [Math.cos(1.3) * 9, 0.4, Math.sin(1.3) * 9])!;
    const moved = at(next, 'token-fremen');
    expect(sectorIndexAt(moved.position)).toBe(Math.floor(1.3 / ((Math.PI * 2) / 18)));
    expect(Math.atan2(moved.position[2], moved.position[0])).toBeCloseTo(
      tableSectorCenterAngle(sectorIndexAt(moved.position))
    );
    expect(next.events[0]?.message).toBe('fremen token moved to sector 4.');
  });

  test('set down on another token, the two trade sectors', () => {
    const state = tableWith(token('fremen', 2), token('emperor', 7));
    const emperor = at(state, 'token-emperor');
    const next = dropAt(state, at(state, 'token-fremen'), emperor.position)!;
    expect(sectorIndexAt(at(next, 'token-fremen').position)).toBe(7);
    expect(sectorIndexAt(at(next, 'token-emperor').position)).toBe(2);
    expect(next.events[0]?.message).toBe('fremen token swapped places with emperor token.');
  });

  test('a locked token keeps its sector', () => {
    const state = tableWith(token('fremen', 2), { ...token('emperor', 7), locked: true });
    expect(dropAt(state, at(state, 'token-fremen'), at(state, 'token-emperor').position)).toBeNull();
  });

  test('storm order follows where the tokens stand', () => {
    const roster = {
      seatCount: 2,
      seats: [
        { position: 0, faction: { id: 'fremen' } },
        { position: 1, faction: { id: 'emperor' } },
      ],
    } as Parameters<typeof stormOrder>[1];
    const pieces = [token('fremen', 2), token('emperor', 7)];
    expect(stormOrder(8, roster, pieces)).toEqual(['emperor', 'fremen']);
    expect(stormOrder(3, roster, pieces)).toEqual(['fremen', 'emperor']);
  });
});

describe('faction tokens settle only where there is room', () => {
  test('a piece resting at the sector centre keeps the token out', () => {
    const fremen = token('fremen', 2);
    const pose = factionTokenRingPose(tableSectorCenterAngle(9));
    const card = freshTableState().pieces.find((piece) => piece.kind === 'card')!;
    const state = tableWith(fremen, { ...card, position: [pose.position[0], 0.005, pose.position[2]] });
    expect(dropAt(state, fremen, pose.position)).toBeNull();
  });

  test('a point on a sector edge lands in one sector whatever its distance from the centre', () => {
    const edge = (Math.PI * 2 * 10) / 18;
    const sectors = [1, 4.39, 9].map((radius) => sectorIndexAt([Math.cos(edge) * radius, 0, Math.sin(edge) * radius]));
    expect(new Set(sectors).size).toBe(1);
  });
});

describe('faction tokens from games stored before the ring', () => {
  const legacy = (id: string, degrees: number, radius = 4.39) => {
    const angle = (degrees * Math.PI) / 180;
    return { ...token(id, 2), position: [Math.cos(angle) * radius, 0.005, Math.sin(angle) * radius] as Vector3Tuple };
  };

  test('two tokens sharing a sector never settle on top of each other', () => {
    const state = tableWith(legacy('a', 41), legacy('b', 59));
    expect(dropAt(state, at(state, 'token-a'), at(state, 'token-a').position)).toBeNull();
    expect(dropAt(state, at(state, 'token-b'), at(state, 'token-b').position)).toBeNull();
  });

  test('a token off the ring neither blocks nor trades with a ring sector', () => {
    const state = tableWith(token('fremen', 2), { ...legacy('emperor', 155, 1.5), locked: true });
    const target = factionTokenRingPose(tableSectorCenterAngle(8)).position;
    const next = dropAt(state, at(state, 'token-fremen'), target)!;
    expect(sectorIndexAt(at(next, 'token-fremen').position)).toBe(8);
    expect(at(next, 'token-emperor').position).toEqual(at(state, 'token-emperor').position);
  });
});
