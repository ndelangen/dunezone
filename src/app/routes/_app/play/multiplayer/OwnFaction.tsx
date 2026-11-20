import { Text, VisuallyHidden } from '@mantine/core';
import { Surface } from '@ui/surface';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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
 * Callers own opening Faction info on a seat, whether a board gesture holds the pointer, and where the toast stands (`children` places it);
 * this owns the toast that says the viewer's dealt faction, its lifetime, its dismissal, and its announcement.
 * The soft notices stand it at the top of their stack under the phase header, so a notice arriving meanwhile queues below it instead of covering it.
 * The state lives here rather than in the placed toast, so the notices starting afresh as Trading moves to Setup neither bring back a dismissed toast nor announce it again.
 * Clicking it asks for Faction info on the viewer's own seat.
 * A polite live region stays mounted beside it and is filled only after it mounts, so a screen reader hears the faction even for a player who joins mid-deal.
 */
export function OwnFactionNotice({
  inert,
  onOpenFactionInfo,
  children,
}: Readonly<{
  inert: boolean;
  onOpenFactionInfo: (seat: string) => void;
  children: (toast: ReactNode) => ReactNode;
}>) {
  const { player, arrival } = useOwnFactionArrival();
  const motion = useMotionAllowed();
  const lifetime = useContext(NoticeLifetime);
  const [dismissed, setDismissed] = useState(0);
  /* The lifetime counts from when the toast first shows, not from the arrival, so a slow notices chunk does not use it up unseen. */
  const [seenSince, setSeenSince] = useState<Readonly<{ arrival: number; at: number }> | null>(null);
  const markSeen = useCallback(
    () => setSeenSince((before) => (before?.arrival === arrival ? before : { arrival, at: performance.now() })),
    [arrival]
  );
  const since = seenSince?.arrival === arrival ? seenSince.at : null;
  useEffect(() => {
    if (since === null || !Number.isFinite(lifetime)) {
      return;
    }
    const gone = window.setTimeout(() => setDismissed(arrival), Math.max(0, since + lifetime - performance.now()));
    return () => window.clearTimeout(gone);
  }, [arrival, since, lifetime]);
  const announced = arrival > 0 ? player : undefined;
  const shown = dismissed === arrival ? undefined : announced;
  const toast = shown && (
    <Surface
      key={arrival}
      padding="sm"
      interactive
      className={styles.toast}
      data-motion={motion || undefined}
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
      <SeenMark onSeen={markSeen} />
      <PlayerToken player={shown} size={28} />
      <Text size="sm">You are playing {shown.factionName}</Text>
    </Surface>
  );
  return (
    <>
      <Announcement text={announced ? `You are playing ${announced.factionName}` : ''} />
      {children(toast)}
    </>
  );
}

/* Tells its owner once it is in the page. */
function SeenMark({ onSeen }: Readonly<{ onSeen: () => void }>) {
  useEffect(onSeen, [onSeen]);
  return null;
}

/* A live region announces only a change after it is in the page, so it mounts empty and takes its text a moment later. */
function Announcement({ text }: Readonly<{ text: string }>) {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const later = window.setTimeout(() => setSpoken(text), 0);
    return () => window.clearTimeout(later);
  }, [text]);
  return (
    <VisuallyHidden role="status" aria-live="polite">
      {spoken}
    </VisuallyHidden>
  );
}
