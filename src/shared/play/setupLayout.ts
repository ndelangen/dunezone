import type { Vector3Tuple } from './model';
import { CARD_BAY_PLACEMENT_ANCHORS, CARD_SLOT_OUTER_SIZE } from './tableFurnitureLayout';
import { FACTION_TOKEN_SCALE, TROOP_FOOTPRINT_RADIUS } from './tableGeometry';
import { PLAYER_RING_RADIUS } from './tableSettings';

/* Troop reserves stand right behind the faction token, on the side away from the board, just clear of its footprint. */
const RESERVE_RADIUS = PLAYER_RING_RADIUS + TROOP_FOOTPRINT_RADIUS * (FACTION_TOKEN_SCALE + 1) + 0.01;

const RESERVE_SPACING = 0.4;

/*
 * The card wells reach in across the table's left and right edges, and a reserve beside one would block a deck from its well.
 * Within this angle of the x axis a reserve on its arc would touch the nearest well, so reserves keep to the two arcs between the wells.
 */
const WELL_INNER_X = Math.min(
  ...CARD_BAY_PLACEMENT_ANCHORS.map((anchor) => Math.abs(anchor.position[0]) - CARD_SLOT_OUTER_SIZE.width / 2)
);
const WELL_CLEAR_ANGLE = Math.acos((WELL_INNER_X - TROOP_FOOTPRINT_RADIUS - 0.02) / RESERVE_RADIUS);
const RESERVE_STEP = RESERVE_SPACING / RESERVE_RADIUS;

function polar(angle: number, radius: number): Vector3Tuple {
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

function wrapped(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/* Where each troop kind's reserve would stand with nothing in the way: an arc centred behind the token. */
function reserveArc(angle: number, troopKinds: number) {
  return Array.from({ length: troopKinds }, (_, index) => angle + (index - (troopKinds - 1) / 2) * RESERVE_STEP);
}

/*
 * Every seat's reserve angles, each as near behind its token as the table allows: reserves keep to the arcs between the card wells,
 * and one pushed out of a well's way pushes its neighbours along just far enough to keep them apart.
 */
export function reserveAngles(seats: readonly Readonly<{ angle: number; troopKinds: number }>[]): number[][] {
  const result = seats.map(({ troopKinds }) => Array<number>(troopKinds).fill(0));
  const limit = Math.PI / 2 - WELL_CLEAR_ANGLE;
  for (const middle of [Math.PI / 2, -Math.PI / 2]) {
    /* Each arc's reserves by their place along it, measured from the arc's middle. */
    const placed = seats
      .flatMap(({ angle, troopKinds }, seat) =>
        Math.sin(angle) >= 0 === middle > 0
          ? reserveArc(angle, troopKinds).map((wanted, kind) => ({ seat, kind, at: wrapped(wanted - middle) }))
          : []
      )
      .sort((a, b) => a.at - b.at);
    placed.forEach((reserve, index) => {
      const after = index ? placed[index - 1]!.at + RESERVE_STEP : -limit;
      reserve.at = Math.max(reserve.at, after);
    });
    for (let index = placed.length - 1; index >= 0; index--) {
      const before = index < placed.length - 1 ? placed[index + 1]!.at - RESERVE_STEP : limit;
      placed[index]!.at = Math.min(placed[index]!.at, before);
    }
    for (const { seat, kind, at } of placed) {
      result[seat]![kind] = at + middle;
    }
  }
  return result;
}

/** Supply faces its seat: the faction token on the seat's station, with troop reserves right behind it. */
export function factionSupplyLayout(
  angle: number,
  troopKinds: number,
  reserves = reserveAngles([{ angle, troopKinds }])[0]!
) {
  const along = (radius: number, offset = 0): Vector3Tuple => [
    Math.cos(angle) * radius - Math.sin(angle) * offset,
    0,
    Math.sin(angle) * radius + Math.cos(angle) * offset,
  ];
  return {
    token: {
      position: along(PLAYER_RING_RADIUS),
      orientation: Math.PI / 2 - angle,
    },
    // An arc at one radius keeps every kind's reserve within the playable table, however many kinds a faction has.
    reserves: reserves.map((reserveAngle) => polar(reserveAngle, RESERVE_RADIUS)),
    traitors: {
      position: along(3.15),
      orientation: Math.PI / 2 - angle,
    },
  };
}
