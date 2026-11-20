import { Text } from '@mantine/core';
import { Surface } from '@ui/surface';
import { createContext, useContext, useEffect, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { CompassPlayer } from '../compass/compassTable';
import { CompassTableContext } from '../compass/compassTable';
import { PlayerToken } from '../compass/PlayerToken';
import styles from './OwnFaction.module.css';

/*
 * PROTOTYPE (#2987): ways to tell a player which faction they are once factions are dealt.
 * Each story picks one; the table shows none of them until Norbert chooses.
 */
export type OwnFactionCue = 'none' | 'reveal' | 'table-tag' | 'header' | 'dock' | 'toast' | 'faction-info';

export const OwnFactionCueContext = createContext<OwnFactionCue>('none');

export function useOwnFactionCue() {
  return useContext(OwnFactionCueContext);
}

/** The viewer's own seat at the table, once it carries a faction; a spectator has none. */
export function useOwnPlayer(): CompassPlayer | undefined {
  const table = useContext(CompassTableContext);
  const own = table?.players.find((player) => player.own);
  return own?.factionName ? own : undefined;
}

/*
 * A count that steps each time the viewer is dealt a faction, or trades it for another, while the game is being set up.
 * Joining or reloading during the deal counts too: the player may not have seen it yet. Once play begins nothing steps.
 */
export function useOwnFactionArrival(): Readonly<{ player?: CompassPlayer; arrival: number }> {
  const player = useOwnPlayer();
  const name = player?.factionName ?? null;
  const dealing = Boolean(useContext(CompassTableContext)?.dealing);
  const [seen, setSeen] = useState<{ name: string | null; arrival: number }>({ name: null, arrival: 0 });
  if (dealing && name !== seen.name) {
    setSeen({ name, arrival: name ? seen.arrival + 1 : seen.arrival });
  }
  return { player, arrival: name && dealing ? seen.arrival : 0 };
}

const REVEAL_MS = 4500;

/** A short centred reveal over the table: "You are playing" over the faction's token and name. Click or a few seconds dismisses it. */
function OwnFactionReveal({ player, arrival }: Readonly<{ player: CompassPlayer; arrival: number }>) {
  const motion = useMotionAllowed();
  const [dismissed, setDismissed] = useState(0);
  const [leaving, setLeaving] = useState(0);
  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(arrival), REVEAL_MS - 500);
    const gone = window.setTimeout(() => setDismissed(arrival), REVEAL_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(gone);
    };
  }, [arrival]);
  if (!arrival || dismissed === arrival) {
    return null;
  }
  return (
    <div
      className={styles.revealLayer}
      data-motion={motion || undefined}
      data-leaving={leaving === arrival || undefined}
    >
      <Surface
        padding="xl"
        tone="ground"
        interactive
        className={styles.reveal}
        aria-label={`You are playing ${player.factionName}`}
        renderRoot={(props) => <button type="button" {...props} onClick={() => setDismissed(arrival)} />}
      >
        <Text size="sm" c="dimmed">
          You are playing
        </Text>
        <span className={styles.revealToken}>
          <PlayerToken player={player} size={112} />
        </span>
        <Text fw={600} className={styles.revealName}>
          {player.factionName}
        </Text>
      </Surface>
    </div>
  );
}

/** A soft notification under the phase header, like the turn toasts: it opens Faction info on the viewer's own faction. */
function OwnFactionToast({
  player,
  arrival,
  onOpen,
}: Readonly<{ player: CompassPlayer; arrival: number; onOpen: () => void }>) {
  const motion = useMotionAllowed();
  const [dismissed, setDismissed] = useState(0);
  useEffect(() => {
    const gone = window.setTimeout(() => setDismissed(arrival), 8000);
    return () => window.clearTimeout(gone);
  }, [arrival]);
  if (!arrival || dismissed === arrival) {
    return null;
  }
  return (
    <div className={styles.toastStack} data-motion={motion || undefined}>
      <Surface
        padding="sm"
        interactive
        className={styles.toast}
        renderRoot={(props) => (
          <button
            type="button"
            {...props}
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

/** Opens Faction info, which shows the viewer's own faction unless another is asked for, each time a faction is dealt to them. */
function OpenOwnFactionInfo({ arrival, onOpen }: Readonly<{ arrival: number; onOpen: () => void }>) {
  useEffect(() => {
    if (arrival) {
      onOpen();
    }
    // Only a new arrival opens it again; the opener changing identity is not news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);
  return null;
}

/** The moment cues, laid over the table with the notices: the reveal, the toast, or Faction info opening. */
export function OwnFactionMoment({ onOpenInfo }: Readonly<{ onOpenInfo: () => void }>) {
  const cue = useOwnFactionCue();
  const { player, arrival } = useOwnFactionArrival();
  if (!player) {
    return null;
  }
  if (cue === 'reveal') {
    return <OwnFactionReveal player={player} arrival={arrival} />;
  }
  if (cue === 'toast') {
    return <OwnFactionToast player={player} arrival={arrival} onOpen={onOpenInfo} />;
  }
  return cue === 'faction-info' ? <OpenOwnFactionInfo arrival={arrival} onOpen={onOpenInfo} /> : null;
}

/** A chip beside the phase in the header: the viewer's token and "You · faction", for the whole game. */
export function OwnFactionChip() {
  const cue = useOwnFactionCue();
  const player = useOwnPlayer();
  if (cue !== 'header' || !player) {
    return null;
  }
  return (
    <div
      className={`seated-chip ${styles.chip}`}
      data-hides-cursor
      aria-label={`You are playing ${player.factionName}`}
    >
      <PlayerToken player={player} size={26} />
      <span className={styles.chipText}>
        <span className={styles.chipYou}>You</span>
        <span>{player.factionName}</span>
      </span>
    </div>
  );
}
