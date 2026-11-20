import { Text, VisuallyHidden } from '@mantine/core';
import { Surface } from '@ui/surface';
import { useContext, useEffect, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { CompassPlayer } from '../compass/compassTable';
import { CompassTableContext } from '../compass/compassTable';
import { PlayerToken } from '../compass/PlayerToken';
import { NoticeLifetime } from './noticeLifetime';
import styles from './OwnFaction.module.css';

/*
 * Telling a player which faction is theirs once factions are dealt (#2987, Norbert 2026-11-20: "toast + dock token").
 * A toast under the header says it as the deal lands, and the player's own token joins the bottom bar, pulsing as it arrives.
 */

type Arrival = Readonly<{ faction: string | null; count: number }>;

/**
 * The viewer's seat, and a count that steps each time the live table deals them a faction or a trade hands them another.
 * The table names the faction it dealt (`dealt`) only while it deals, so joining or reloading then counts too, and once play begins nothing steps.
 * The count stays after the deal, so a toast raised for it keeps its full lifetime.
 */
export function useOwnFactionArrival(): Readonly<{ player?: CompassPlayer; arrival: number }> {
  const table = useContext(CompassTableContext);
  const own = table?.players.find((entry) => entry.own && entry.factionName);
  const dealt = table?.dealt ?? null;
  const [seen, setSeen] = useState<Arrival>({ faction: null, count: 0 });
  if (dealt && dealt !== seen.faction) {
    setSeen({ faction: dealt, count: seen.count + 1 });
  }
  return { player: own, arrival: seen.count };
}

/**
 * Callers own opening Faction info on a seat and whether a board gesture holds the pointer;
 * this owns the toast that says the viewer's dealt faction, its lifetime, and its announcement.
 * The toast stands under the phase header, and clicking it asks for Faction info on the viewer's own seat.
 * A polite live region stays mounted beside it, so a screen reader hears the faction even though the toast comes and goes.
 */
export function OwnFactionToast({
  inert,
  onOpenFactionInfo,
}: Readonly<{ inert: boolean; onOpenFactionInfo: (seat: string) => void }>) {
  const { player, arrival } = useOwnFactionArrival();
  const motion = useMotionAllowed();
  const lifetime = useContext(NoticeLifetime);
  const [dismissed, setDismissed] = useState(0);
  useEffect(() => {
    if (!arrival || !Number.isFinite(lifetime)) {
      return;
    }
    const gone = window.setTimeout(() => setDismissed(arrival), lifetime);
    return () => window.clearTimeout(gone);
  }, [arrival, lifetime]);
  const announced = arrival > 0 ? player : undefined;
  const shown = dismissed === arrival ? undefined : announced;
  return (
    <>
      <VisuallyHidden role="status" aria-live="polite">
        {announced ? `You are playing ${announced.factionName}` : ''}
      </VisuallyHidden>
      {shown && (
        <div className={styles.stack} data-motion={motion || undefined}>
          <Surface
            key={arrival}
            padding="sm"
            interactive
            className={styles.toast}
            renderRoot={(props) => (
              <button
                type="button"
                {...props}
                disabled={inert}
                onClick={() => {
                  setDismissed(arrival);
                  onOpenFactionInfo(shown.seat);
                }}
              />
            )}
          >
            <PlayerToken player={shown} size={28} />
            <Text size="sm">You are playing {shown.factionName}</Text>
          </Surface>
        </div>
      )}
    </>
  );
}
