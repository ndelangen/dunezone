/* @jsxImportSource @app/widgets/tabletop/three-jsx */

import { Html } from '@react-three/drei/webgpu';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RIM_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';

import type { OwnFactionCue } from './OwnFaction';
import styles from './OwnFaction.module.css';

/* How high over the seat's token the tag floats, in table units. */
const LIFT = 0.75;

/** PROTOTYPE (#2987): a "You" tag floating over the viewer's own seat on the table, for the whole game. */
export function OwnSeatTag({
  cue,
  snapshot,
  viewerSeat,
}: Readonly<{ cue: OwnFactionCue; snapshot: GameSnapshot; viewerSeat: string }>) {
  const roster = snapshot.roster;
  const seat = roster?.seats.find((entry) => entry.id === viewerSeat);
  if (cue !== 'table-tag' || !roster || !seat?.faction) {
    return null;
  }
  const angle = tableSeatAngles(roster.seatCount)[seat.position]!;
  const position: [number, number, number] = [
    Math.cos(angle) * PLAYER_RING_RADIUS,
    BOARD_RIM_SURFACE_Y + LIFT,
    Math.sin(angle) * PLAYER_RING_RADIUS,
  ];
  return (
    <group position={position}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <span className={styles.tableTag} data-own-seat-tag aria-label={`Your seat: ${seat.faction.name}`}>
          <span className={styles.tableTagPill}>You</span>
          <span className={styles.tableTagStem} />
        </span>
      </Html>
    </group>
  );
}
