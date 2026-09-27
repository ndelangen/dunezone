import type { GameSnapshot } from '@shared/play/protocol';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { useCallback, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { CONFETTI_STREAM_SECONDS } from '../confettiSimulation';
import type { ConfettiLaunch } from '../FoilConfetti';
import type { TableProjection } from './TableSession';

/* The result a finished game declared, with the seating to aim it by. */
function declared(snapshot: GameSnapshot) {
  const { result, roster } = snapshot;
  return snapshot.stage === 'finished' && result && roster ? { result, roster } : null;
}

/**
 * The celebration a declared result fires (#1038): a stream from every winning faction's slot, allies together.
 * No winner fires nothing, and neither does a result declared longer ago than a stream lasts.
 * A viewer who arrives while it streams joins it where it has got to.
 */
export function celebrationFor(snapshot: GameSnapshot, serverNow: number): ConfettiLaunch | null {
  const found = declared(snapshot);
  if (!found) {
    return null;
  }
  const { result, roster } = found;
  const elapsed = Math.max(0, (serverNow - result.declaredAt) / 1000);
  if (elapsed >= CONFETTI_STREAM_SECONDS) {
    return null;
  }
  const seatAngles = tableSeatAngles(roster.seatCount);
  const angles = roster.seats.flatMap((seat) =>
    seat.faction && result.factionIds.includes(seat.faction.id) ? [seatAngles[seat.position]!] : []
  );
  return angles.length > 0 ? { id: result.declaredAt, angles, elapsed } : null;
}

type Seen = Readonly<{ fired: number | null; cleared: number | null; onTable: boolean }>;

/**
 * The table's celebration and the viewer's own way to stop and clear it.
 * Clearing is local: the confetti is decoration and never game state, so it neither asks nor tells anyone.
 * A viewer who asked for less motion is spared the stream, and so has nothing to clear.
 */
export function useResultCelebration(table: TableProjection) {
  const motion = useMotionAllowed();
  const [seen, setSeen] = useState<Seen>({ fired: null, cleared: null, onTable: false });
  /* Playback shows an earlier table, which never celebrates again. */
  const live = motion && !table.playback ? celebrationFor(table.snapshot, table.serverNow()) : null;
  const launch = live && live.id !== seen.cleared ? live : null;
  if (launch && launch.id !== seen.fired) {
    setSeen({ ...seen, fired: launch.id, onTable: true });
  }
  const clear = useCallback(() => setSeen((current) => ({ ...current, cleared: current.fired, onTable: false })), []);
  return {
    launch,
    /* The confetti stays mounted while a stream runs or foil lies on the table; unmounting it is the clear. */
    mounted: launch !== null || seen.onTable,
    hasConfetti: seen.onTable,
    clear,
  };
}
