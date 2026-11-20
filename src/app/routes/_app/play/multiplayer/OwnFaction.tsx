import { Text } from '@mantine/core';
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

/**
 * A count that steps each time the viewer is dealt a faction, or trades it for another, while factions are dealt and set up;
 * 0 otherwise.
 * Joining or reloading then counts too, since the player may not have seen their faction yet.
 * Once play begins nothing steps.
 */
export function useOwnFactionArrival(): Readonly<{ player?: CompassPlayer; arrival: number }> {
  const table = useContext(CompassTableContext);
  const own = table?.players.find((entry) => entry.own);
  const player = own?.factionName ? own : undefined;
  const name = player?.factionName ?? null;
  const dealing = Boolean(table?.dealing);
  const [seen, setSeen] = useState<Readonly<{ name: string | null; arrival: number }>>({ name: null, arrival: 0 });
  if (dealing && name !== seen.name) {
    setSeen({ name, arrival: name ? seen.arrival + 1 : seen.arrival });
  }
  return { player, arrival: name && dealing ? seen.arrival : 0 };
}

/**
 * A soft notification under the phase header as the viewer is dealt a faction: their token and "You are playing …".
 * It goes after the notices' own lifetime;
 * clicking it opens Faction info, which shows the viewer's own faction.
 * While a board gesture holds the pointer (`inert`) it stays readable but cannot be opened.
 */
export function OwnFactionToast({ inert, onOpen }: Readonly<{ inert: boolean; onOpen: () => void }>) {
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
  if (!player || !arrival || dismissed === arrival) {
    return null;
  }
  return (
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
              onOpen();
            }}
          />
        )}
      >
        <PlayerToken player={player} size={28} />
        <Text size="sm">You are playing {player.factionName}</Text>
      </Surface>
    </div>
  );
}
