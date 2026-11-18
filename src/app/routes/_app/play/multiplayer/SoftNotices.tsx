import { Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { GameSnapshot } from '@shared/play/protocol';
import { reviewRunning } from '@shared/play/review';
import { Surface } from '@ui/surface';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import clsx from 'clsx';
import { Coins, Gavel, Handshake, Sailboat, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import type { FactionToken } from './FactionTokenFace';
import { FactionTokenFace, snapshotFactionToken } from './FactionTokenFace';
import { noticesBetween } from './noticeEvents';
import type { SoftNoticeKind } from './noticeEvents';
import styles from './SoftNotices.module.css';
import { actingFaction } from './tableFactions';

export type SoftNotice = Readonly<{
  id: string;
  kind: SoftNoticeKind;
  /** One line, as the viewer reads it: "Your turn to bid", "Harkonnen paid you 3 spice". */
  text: string;
  /** The faction it came from, or the viewer's own for their turn. */
  from: FactionToken;
  /** When it arrived, on this page's own clock (`performance.now()`): a notice is the page's, not the table's. */
  at: number;
}>;

const ICONS: Record<SoftNoticeKind, LucideIcon> = {
  bid: Gavel,
  ship: Sailboat,
  battle: Swords,
  spice: Coins,
  alliance: Handshake,
};

/** The viewer's own turns, which the screen's edge glows for as well. */
const TURN_KINDS: ReadonlySet<SoftNoticeKind> = new Set(['bid', 'ship', 'battle']);

/** How long a notice shows before it fades, how long the fade takes, and how long a turn's glow lasts. */
const LIFETIME_MS = 6000;
const FADE_MS = 400;
const GLOW_MS = 2400;
/** The most notices kept at once; older ones have long faded. */
const KEPT = 12;

/** The current time on the page's clock, ticking while anything could still change with it. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    const tick = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(tick);
  }, [running]);
  return now;
}

/* The faction the viewer acts for, while the live table is in play: no notices while a past table, a recall or another stage shows. */
function noticedFaction(table: TableProjection): string | undefined {
  if (table.snapshot.stage !== 'play' || reviewRunning(table.review?.current)) {
    return undefined;
  }
  return actingFaction(table);
}

/**
 * The soft notices the live table raises for the viewer as it changes, newest last.
 * Each change is compared with the one before it, so joining or reloading raises nothing for what already happened.
 */
export function useSoftNotices(table: TableProjection): readonly SoftNotice[] {
  const own = noticedFaction(table);
  const snapshot = table.snapshot;
  const previous = useRef<{ own: string; snapshot: GameSnapshot } | null>(null);
  const [notices, setNotices] = useState<readonly SoftNotice[]>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = own ? { own, snapshot } : null;
    if (!own || before?.own !== own) {
      return;
    }
    const names = snapshotFactionLabels(snapshot);
    const raised = noticesBetween(before.snapshot, snapshot, own, names);
    if (!raised.length) {
      return;
    }
    const at = performance.now();
    setNotices((kept) => {
      const known = new Set(kept.map((notice) => notice.id));
      const fresh = raised
        .filter((draft) => !known.has(draft.key))
        .map((draft) => ({
          id: draft.key,
          kind: draft.kind,
          text: draft.text,
          from: snapshotFactionToken(snapshot, draft.factionId, names),
          at,
        }));
      return [...kept, ...fresh].slice(-KEPT);
    });
  }, [own, snapshot]);
  return notices;
}

/**
 * The viewer's soft notifications (#2981): small toasts under the phase header, each with the token of the faction it came from and one line, that fade after a few seconds.
 * When it is the viewer's turn the screen's edge glows softly as well.
 * Clicking one opens what it is about, where it has a place to open, and dismisses it.
 */
export function SoftNotices({
  notices,
  onOpen,
}: Readonly<{ notices: readonly SoftNotice[]; onOpen?: (notice: SoftNotice) => void }>) {
  const motion = useMotionAllowed();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState(false);
  const now = useNow(running);
  /* The clock ticks while a notice could still show: a new one starts it, and it stops once the last has faded. */
  const showing = notices.some((notice) => now - notice.at < LIFETIME_MS);
  if (showing !== running) {
    setRunning(showing);
  }
  const live = notices
    .filter((notice) => !dismissed.has(notice.id) && now - notice.at < LIFETIME_MS)
    .toSorted((a, b) => b.at - a.at);
  const open = (notice: SoftNotice) => {
    setDismissed((before) => new Set(before).add(notice.id));
    onOpen?.(notice);
  };
  const glowing = live.some((notice) => TURN_KINDS.has(notice.kind) && now - notice.at < GLOW_MS);

  return (
    <DarkSchemeIsland>
      <div
        {...darkSchemeIslandAttributes}
        className={styles.root}
        data-motion={motion || undefined}
        role="log"
        aria-live="polite"
        aria-label="Notifications"
      >
        <div className={styles.glow} data-on={glowing || undefined} aria-hidden />
        <div className={styles.stack}>
          {live.slice(0, 4).map((notice) => (
            <Toast key={notice.id} notice={notice} onOpen={open} leaving={now - notice.at > LIFETIME_MS - FADE_MS} />
          ))}
        </div>
      </div>
    </DarkSchemeIsland>
  );
}

function Toast({
  notice,
  onOpen,
  leaving,
}: Readonly<{ notice: SoftNotice; onOpen: (notice: SoftNotice) => void; leaving: boolean }>) {
  const Icon = ICONS[notice.kind];
  return (
    <Surface
      padding="sm"
      interactive
      className={clsx(styles.toast, TURN_KINDS.has(notice.kind) && styles.turn)}
      renderRoot={(props) => (
        <button type="button" {...props} data-leaving={leaving || undefined} onClick={() => onOpen(notice)} />
      )}
    >
      <FactionTokenFace token={notice.from} size={28} aria-hidden />
      <Text size="sm" className={styles.line}>
        {notice.text}
      </Text>
      <Icon size={16} aria-hidden className={styles.icon} />
    </Surface>
  );
}
