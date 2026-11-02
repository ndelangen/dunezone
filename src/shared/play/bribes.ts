import { factionTokenOf, factionTokenRingAngle, isFactionToken } from './factionToken';
import type { TablePiece, Vector3Tuple } from './model';
import type { TableRoster } from './schema';
import { SPICE_FOOTPRINT_RADIUS } from './spice';
import { FACTION_TOKEN_SCALE, planarDistance, TROOP_FOOTPRINT_RADIUS } from './tableGeometry';
import { TABLE_PLAY_RADIUS } from './tablePhysics';
import { PLAYER_RING_RADIUS, tableSeatAngles } from './tableSettings';

/*
 * Where a faction's bribe pile stands. Four placements are on trial so Norbert can pick one by looking at it;
 * the three left over go once he has.
 */
export const BRIBE_PILE_PLACEMENTS = ['behind-troops', 'beside-token', 'end-of-troops', 'before-token'] as const;
export type BribePilePlacement = (typeof BRIBE_PILE_PLACEMENTS)[number];
export const BRIBE_PILE_PLACEMENT: BribePilePlacement = 'behind-troops';

const FACTION_TOKEN_RADIUS = TROOP_FOOTPRINT_RADIUS * FACTION_TOKEN_SCALE;
/* The arc the troop reserves stand on, as setup deals them (setupLayout.ts). */
const RESERVE_RADIUS = PLAYER_RING_RADIUS + TROOP_FOOTPRINT_RADIUS * (FACTION_TOKEN_SCALE + 1) + 0.01;
const RESERVE_SPACING = 0.4;
/* The outermost spot a spice stack still stands wholly on the table. */
const TABLE_EDGE_RADIUS = TABLE_PLAY_RADIUS - SPICE_FOOTPRINT_RADIUS - 0.005;
const CLEARANCE = 0.04;

/** Whether `position` lies over the token of a faction, and which; the token a carry is held over. */
export function factionTokenUnder(pieces: readonly TablePiece[], position: Readonly<Vector3Tuple>) {
  const token = pieces.find(
    (piece) => isFactionToken(piece) && planarDistance(piece.position, position) <= FACTION_TOKEN_RADIUS
  );
  return token?.stackKey?.slice('faction-token:'.length);
}

/** How many troop kinds a faction was dealt, counted by its reserve stacks wherever they are now. */
function troopKindsOf(pieces: readonly TablePiece[], factionId: string) {
  const prefix = `troops:${factionId}:`;
  return new Set(pieces.flatMap((piece) => (piece.stackKey?.startsWith(prefix) ? [piece.stackKey] : []))).size;
}

/* A point `radius` from the board's centre, `offset` along the ring from `angle` (counter-clockwise positive). */
function along(angle: number, radius: number, offset: number): Vector3Tuple {
  const turned = angle + offset / radius;
  return [Math.cos(turned) * radius, 0, Math.sin(turned) * radius];
}

/** The angle a faction's station stands at, as its seat fixed it. */
function seatAngleOf(roster: TableRoster | undefined, factionId: string) {
  const seat = roster?.seats.find((entry) => entry.faction?.id === factionId);
  return roster && seat ? tableSeatAngles(roster.seatCount)[seat.position] : undefined;
}

/**
 * Where `factionId`'s bribe pile stands under `placement`, or undefined for a faction with no seat.
 * - behind-troops: past the troop reserves at the table's edge, tucked in a gap between two of them.
 * - beside-token: on the ring next to the faction token, wherever the token now stands.
 * - end-of-troops: one more place along the arc the troop reserves stand on.
 * - before-token: in front of the token, toward the board, to one side of where withdrawn spice lands.
 */
export function bribePilePosition(
  pieces: readonly TablePiece[],
  roster: TableRoster | undefined,
  factionId: string,
  placement: BribePilePlacement = BRIBE_PILE_PLACEMENT
): Vector3Tuple | undefined {
  const angle = seatAngleOf(roster, factionId);
  if (angle === undefined) {
    return undefined;
  }
  const kinds = Math.max(1, troopKindsOf(pieces, factionId));
  switch (placement) {
    case 'behind-troops':
      /* An odd count has a reserve dead centre, so the pile takes the gap beside it; an even count leaves the centre free. */
      return along(angle, TABLE_EDGE_RADIUS, kinds % 2 === 1 ? RESERVE_SPACING / 2 : 0);
    case 'beside-token': {
      const token = factionTokenOf(pieces, factionId);
      const tokenAngle = token ? factionTokenRingAngle(token.position) : angle;
      return along(tokenAngle, PLAYER_RING_RADIUS, FACTION_TOKEN_RADIUS + SPICE_FOOTPRINT_RADIUS + CLEARANCE);
    }
    case 'end-of-troops':
      return along(angle, RESERVE_RADIUS, ((kinds - 1) / 2 + 1) * RESERVE_SPACING);
    case 'before-token':
      return along(
        angle,
        PLAYER_RING_RADIUS - FACTION_TOKEN_RADIUS - SPICE_FOOTPRINT_RADIUS - CLEARANCE,
        -(SPICE_FOOTPRINT_RADIUS * 2 + CLEARANCE)
      );
  }
}
