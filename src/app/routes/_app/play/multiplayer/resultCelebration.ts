import type { GameSnapshot } from '@shared/play/protocol';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { useCallback, useState } from 'react';

import { CONFETTI_STREAM_SECONDS } from '../confettiSimulation';
import type { ConfettiLaunch } from '../FoilConfetti';
import type { TableProjection } from './TableSession';

/**
 * The celebration a declared result fires (#1038): a stream from every winning faction's slot, allies together.
 * No winner fires nothing, and neither does a result declared longer ago than a stream lasts.
 * A viewer who arrives while it streams joins it where it has got to.
 */
export function celebrationFor(snapshot: GameSnapshot, serverNow: number): ConfettiLaunch | null {
  const { result, roster, stage } = snapshot;
  if (stage !== 'finished' || !result || !roster) {
    return null;
  }
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

/**
 * The table's celebration and the viewer's own way to stop and clear it.
 * Clearing is local: the confetti is decoration and never game state, so it neither asks nor tells anyone.
 */
export function useResultCelebration(table: TableProjection) {
  const [clearRevision, setClearRevision] = useState(0);
  const [celebration, setCelebration] = useState<{
    launch: ConfettiLaunch | null;
    shown: boolean;
  }>({
    launch: null,
    shown: false,
  });
  /* Playback shows an earlier table, which never celebrates again. */
  const candidate = table.playback ? null : celebrationFor(table.snapshot, table.serverNow());
  if (candidate && candidate.id !== celebration.launch?.id) {
    setCelebration({ launch: candidate, shown: true });
  }
  const clear = useCallback(() => {
    setClearRevision((revision) => revision + 1);
    setCelebration((current) => ({ ...current, shown: false }));
  }, []);
  return {
    launch: celebration.launch,
    clearRevision,
    hasConfetti: celebration.shown,
    clear,
  };
}
