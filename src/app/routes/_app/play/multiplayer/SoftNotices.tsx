import { Text } from '@mantine/core';
import { Surface } from '@ui/surface';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import clsx from 'clsx';
import { AtSign, Coins, Gavel, Handshake, MousePointerClick, Sailboat, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { FactionToken } from './FactionTokenFace';
import { FactionTokenFace } from './FactionTokenFace';
import styles from './SoftNotices.module.css';

/** What happened to the viewer: their turn came up, they got paid, pinged, offered an alliance or mentioned (#2981). */
export type SoftNoticeKind = 'bid' | 'ship' | 'battle' | 'spice' | 'ping' | 'alliance' | 'mention';

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

/**
 * Where and how the notices show.
 * A prototype offers several to pick from (#2981).
 * Header (`header`) stacks toasts under the phase header, newest on top, and `corner` stacks them in the lower right, newest at the bottom.
 * Ticker (`ticker`) is one line under the header that the newest replaces, with how many more came.
 * Bubble (`bubble`) is the sender's token under the game's name, speaking the newest in a bubble.
 * Glow (`glow`) is the header toasts, with the screen's edge glowing softly when it is the viewer's turn.
 * Rail (`rail`) is small tokens down the left edge that stay until clicked, each saying its line on hover.
 */
export type SoftNoticeVariant = 'header' | 'corner' | 'ticker' | 'bubble' | 'glow' | 'rail';

const ICONS: Record<SoftNoticeKind, LucideIcon> = {
  bid: Gavel,
  ship: Sailboat,
  battle: Swords,
  spice: Coins,
  ping: MousePointerClick,
  alliance: Handshake,
  mention: AtSign,
};

const TURN_KINDS: ReadonlySet<SoftNoticeKind> = new Set(['bid', 'ship', 'battle']);

/** How long a notice shows before it fades, and how long the fade takes. */
const LIFETIME_MS = 6000;
const FADE_MS = 400;
const GLOW_MS = 2400;

/** The current time, ticking while anything could still change with it. */
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

/**
 * The viewer's soft notifications: small, non-blocking, each with the token of the faction it came from and one line.
 * Clicking one opens what it is about and dismisses it.
 */
export function SoftNotices({
  notices,
  variant,
  onOpen,
}: Readonly<{ notices: readonly SoftNotice[]; variant: SoftNoticeVariant; onOpen?: (notice: SoftNotice) => void }>) {
  const motion = useMotionAllowed();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const now = useNow(notices.length > 0);
  const persistent = variant === 'rail';
  const live = notices
    .filter((notice) => !dismissed.has(notice.id) && (persistent || now - notice.at < LIFETIME_MS))
    .toSorted((a, b) => b.at - a.at);
  const open = (notice: SoftNotice) => {
    setDismissed((before) => new Set(before).add(notice.id));
    onOpen?.(notice);
  };
  const leaving = (notice: SoftNotice) => !persistent && now - notice.at > LIFETIME_MS - FADE_MS;
  const glowing = variant === 'glow' && live.some((notice) => TURN_KINDS.has(notice.kind) && now - notice.at < GLOW_MS);

  return (
    <DarkSchemeIsland>
      <div
        {...darkSchemeIslandAttributes}
        className={styles.root}
        data-variant={variant}
        data-motion={motion || undefined}
        role="log"
        aria-live="polite"
        aria-label="Notifications"
      >
        {variant === 'glow' && <div className={styles.glow} data-on={glowing || undefined} aria-hidden />}
        {variant === 'ticker' ? (
          <Ticker notices={live} onOpen={open} leaving={leaving} />
        ) : variant === 'bubble' ? (
          <Bubble notices={live} onOpen={open} leaving={leaving} />
        ) : variant === 'rail' ? (
          <Rail notices={live} onOpen={open} />
        ) : (
          <div className={styles.stack}>
            {(variant === 'corner' ? live.toReversed() : live).slice(0, 4).map((notice) => (
              <Toast key={notice.id} notice={notice} onOpen={open} leaving={leaving(notice)} />
            ))}
          </div>
        )}
      </div>
    </DarkSchemeIsland>
  );
}

type Leaving = (notice: SoftNotice) => boolean;

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

function Ticker({
  notices,
  onOpen,
  leaving,
}: Readonly<{ notices: readonly SoftNotice[]; onOpen: (notice: SoftNotice) => void; leaving: Leaving }>) {
  const [newest, ...rest] = notices;
  if (!newest) {
    return null;
  }
  const Icon = ICONS[newest.kind];
  return (
    <div className={styles.stack}>
      <Surface
        key={newest.id}
        padding="sm"
        interactive
        className={clsx(styles.toast, styles.ticker, TURN_KINDS.has(newest.kind) && styles.turn)}
        renderRoot={(props) => (
          <button type="button" {...props} data-leaving={leaving(newest) || undefined} onClick={() => onOpen(newest)} />
        )}
      >
        <Icon size={16} aria-hidden className={styles.icon} />
        <Text size="sm" className={styles.line}>
          {newest.text}
        </Text>
        {rest.length > 0 && (
          <Text size="xs" c="dimmed" className={styles.more}>
            +{rest.length} more
          </Text>
        )}
      </Surface>
    </div>
  );
}

function Bubble({
  notices,
  onOpen,
  leaving,
}: Readonly<{ notices: readonly SoftNotice[]; onOpen: (notice: SoftNotice) => void; leaving: Leaving }>) {
  const [newest] = notices;
  if (!newest) {
    return null;
  }
  return (
    <div className={styles.bubbleRow}>
      <span className={styles.pulse} key={`${newest.id}-token`}>
        <FactionTokenFace token={newest.from} size={40} aria-hidden />
      </span>
      <Surface
        key={`${newest.id}-line`}
        padding="sm"
        interactive
        className={clsx(styles.toast, styles.bubble)}
        renderRoot={(props) => (
          <button type="button" {...props} data-leaving={leaving(newest) || undefined} onClick={() => onOpen(newest)} />
        )}
      >
        <Text size="sm" className={styles.line}>
          {newest.text}
        </Text>
        {notices.length > 1 && (
          <Text size="xs" c="dimmed" className={styles.more}>
            +{notices.length - 1}
          </Text>
        )}
      </Surface>
    </div>
  );
}

function Rail({ notices, onOpen }: Readonly<{ notices: readonly SoftNotice[]; onOpen: (notice: SoftNotice) => void }>) {
  return (
    <div className={styles.rail}>
      {notices.slice(0, 8).map((notice) => {
        const Icon = ICONS[notice.kind];
        return (
          <button
            key={notice.id}
            type="button"
            className={styles.railItem}
            aria-label={notice.text}
            onClick={() => onOpen(notice)}
          >
            <FactionTokenFace token={notice.from} size={32} aria-hidden />
            <span className={styles.railIcon}>
              <Icon size={12} aria-hidden />
            </span>
            <Surface padding="sm" className={styles.railLabel}>
              <Text size="sm" className={styles.line}>
                {notice.text}
              </Text>
            </Surface>
          </button>
        );
      })}
    </div>
  );
}
