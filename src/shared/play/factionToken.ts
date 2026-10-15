import type { TablePiece, Vector3Tuple } from './model';
import { PLAYER_RING_RADIUS, tableSectorCenterAngle, TABLE_SECTOR_COUNT } from './tableSettings';

/** The stack key a faction's token keeps on the table for the whole game. */
export function factionTokenStackKey(factionId: string) {
  return `faction-token:${factionId}`;
}

/** A faction's token among the table's pieces, if the table has one. */
export function factionTokenOf<P extends Pick<TablePiece, 'stackKey'>>(
  pieces: readonly P[],
  factionId: string
): P | undefined {
  const key = factionTokenStackKey(factionId);
  return pieces.find((piece) => piece.stackKey === key);
}

/** A faction's own token: one per seated faction, dealt onto the table at setup; it is never a battle leader. */
export function isFactionToken(piece: Partial<Pick<TablePiece, 'kind' | 'stackKey'>>): boolean {
  return piece.kind === 'force' && (piece.stackKey?.startsWith('faction-token:') ?? false);
}

/**
 * Whether a faction's token shows its face: face down signals the faction sits out, as in a bidding round.
 * A table without the token (a game set up before tokens stayed) reads as face up.
 */
export function factionTokenFaceUp(pieces: readonly TablePiece[], factionId: string): boolean {
  return factionTokenOf(pieces, factionId)?.items[0]?.faceUp ?? true;
}

/*
 * A faction token marks its faction's place in storm order, so it never leaves the ring the seats stand on.
 * Carried, it slides around that ring under the pointer; set down, it settles at the centre of the sector it is over.
 */

/** The ring angle a table point lies at, seen from the board's centre. */
export function factionTokenRingAngle(position: Readonly<Vector3Tuple>): number {
  return Math.atan2(position[2], position[0]);
}

/** A faction token's pose at `angle` on the ring: it faces the board's centre, as setup deals it. */
export function factionTokenRingPose(angle: number, height = 0): { position: Vector3Tuple; orientation: number } {
  return {
    position: [Math.cos(angle) * PLAYER_RING_RADIUS, height, Math.sin(angle) * PLAYER_RING_RADIUS],
    orientation: Math.PI / 2 - angle,
  };
}

/** The storm sector a table point lies in. */
export function sectorIndexAt(position: Readonly<Vector3Tuple>): number {
  const turn = (factionTokenRingAngle(position) / (Math.PI * 2) + 1) % 1;
  return Math.floor(turn * TABLE_SECTOR_COUNT) % TABLE_SECTOR_COUNT;
}

/** Where a faction token set down at `position` comes to rest: the centre of that sector, on the ring. */
export function factionTokenSectorPose(position: Readonly<Vector3Tuple>, height = 0) {
  return factionTokenRingPose(tableSectorCenterAngle(sectorIndexAt(position)), height);
}

/** The other faction token already standing in the sector `position` lies in, if one does. */
export function factionTokenInSector<P extends Pick<TablePiece, 'id' | 'kind' | 'stackKey' | 'position'>>(
  pieces: readonly P[],
  position: Readonly<Vector3Tuple>,
  exceptId: string
): P | undefined {
  const sector = sectorIndexAt(position);
  return pieces.find(
    (piece) => piece.id !== exceptId && isFactionToken(piece) && sectorIndexAt(piece.position) === sector
  );
}
