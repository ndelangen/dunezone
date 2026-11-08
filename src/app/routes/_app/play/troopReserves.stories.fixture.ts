import { seatAngleOf } from '@shared/play/setupLayout';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '@shared/play/tablePhysics';
import { troopFactionOf } from '@shared/play/troopReserves';

import type { StoredSnapshot } from '../../../../../workers/game/state';

type StoredPiece = StoredSnapshot['table']['pieces'][number];

/* How far round from `from` the angle `to` lies, between -π and π. */
function turnBetween(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * The troop kinds each faction was dealt, in setup order, read from where setup laid their reserves out on `stored`.
 * Setup lays a faction's reserves along its arc counter-clockwise, so the order is the reserves' order round the table from the seat.
 * The game Worker reads this order from the faction's capture;
 * a story table has the dealt table instead.
 */
export function dealtTroopsOf(stored: StoredSnapshot) {
  const dealt = new Map<string, string[]>();
  for (const seat of stored.roster?.seats ?? []) {
    const factionId = seat.faction?.id;
    const angle = factionId ? seatAngleOf(stored.roster, factionId) : undefined;
    if (!factionId || angle === undefined) {
      continue;
    }
    const reserves = stored.table.pieces.filter((piece) => !piece.inventory && troopFactionOf(piece) === factionId);
    const along = (piece: StoredPiece) => turnBetween(angle, Math.atan2(piece.position[2], piece.position[0]));
    dealt.set(factionId, [...new Set(reserves.sort((a, b) => along(a) - along(b)).map((piece) => piece.stackKey!))]);
  }
  return (factionId: string) => dealt.get(factionId);
}

/* A piece moved to `at`, as near as the table allows, turned by `orientation`. */
function setDown(piece: StoredPiece, at: [number, number], orientation: number, pieces: StoredPiece[]): StoredPiece {
  const turned = { ...piece, orientation };
  const spot = nearestCollisionFreePosition(turned, [at[0], 0, at[1]], pieces) ?? [at[0], 0, at[1]];
  return { ...turned, position: restingPositionAt(spot, turned) };
}

/**
 * A faction's troops after a few rough turns: both reserves knocked askew behind the seat, 4 troops out on the board, and 2 revived troops lying face down beside the token.
 * The board troops and the revived ones are split off the first reserve, so the count adds up to what setup dealt.
 */
export function withMessyReserves(stored: StoredSnapshot, factionId: string): StoredSnapshot {
  const angle = seatAngleOf(stored.roster, factionId)!;
  const [first, ...rest] = stored.table.pieces.filter(
    (piece) => !piece.inventory && troopFactionOf(piece) === factionId
  );
  if (!first) {
    return stored;
  }
  /* A point `radius` from the centre, `turn` radians round from the seat. */
  const at = (radius: number, turn: number): [number, number] => [
    Math.cos(angle + turn) * radius,
    Math.sin(angle + turn) * radius,
  ];
  const others = stored.table.pieces.filter((piece) => piece.id !== first.id && !rest.includes(piece));
  const moved: StoredPiece[] = [];
  const place = (piece: StoredPiece, spot: [number, number], orientation: number) => {
    const next = setDown(piece, spot, orientation, [...others, ...moved]);
    moved.push(next);
  };
  place({ ...first, items: first.items.slice(6) }, at(5.2, -0.12), 0.6);
  rest.forEach((piece, index) => place(piece, at(4.95 + index * 0.2, 0.14 + index * 0.08), -0.5));
  place({ ...first, id: 'sandbox-on-board', items: first.items.slice(0, 4) }, at(2.6, 0.2), 0.3);
  place(
    {
      ...first,
      id: 'sandbox-revived',
      items: first.items.slice(4, 6).map((item) => ({ ...item, faceUp: false })),
    },
    at(4.75, 0.3),
    1.1
  );
  return {
    ...stored,
    table: { ...stored.table, pieces: [...others, ...moved] },
    versions: Object.fromEntries([
      ...Object.entries(stored.versions),
      ...moved.map((piece) => [piece.id, stored.revision] as const),
    ]),
  };
}
