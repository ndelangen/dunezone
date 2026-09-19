/*
 * PROTOTYPE (#1270): three variants of a Play table route animating in, on the real /play/demo route,
 * switchable with ?variant=A|B|C and held open with ?hold=<ms> so the waiting frame can be reviewed.
 * Throwaway: never merges. The switcher is hidden in a production build.
 */
import { Anchor, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import styles from './LoadingPrototype.module.css';

const VARIANTS = {
  A: 'Line drawing',
  B: 'Sand rises',
  C: 'Iris',
} as const;
type Variant = keyof typeof VARIANTS;

/* The waits a hosted route reports, replayed on the demo route so the text transitions are part of the review. */
const STATUSES = ['Checking access to the hosted table...', 'Loading the table...', 'Connecting to the hosted table...'];

function readSearch() {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get('variant');
  return {
    variant: (variant && variant in VARIANTS ? variant : 'A') as Variant,
    hold: Number(params.get('hold') ?? 3000),
  };
}

function TableLines() {
  /* The table as the site's dice are drawn: a rim, the board, the storm arc, the spokes. */
  const spokes = Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI;
    const dx = Math.cos(angle) * 150;
    const dy = Math.sin(angle) * 78;
    return <line key={index} x1={300 - dx} y1={200 - dy} x2={300 + dx} y2={200 + dy} data-order="4" />;
  });
  return (
    <svg className={styles.lines} viewBox="0 0 600 400" aria-hidden="true">
      <ellipse cx="300" cy="200" rx="270" ry="140" data-order="1" />
      <ellipse cx="300" cy="200" rx="150" ry="78" data-order="2" />
      <path d="M 158 232 A 150 78 0 0 0 232 274" data-order="3" strokeWidth="5" opacity="0.7" />
      {spokes}
      <ellipse cx="300" cy="200" rx="34" ry="18" data-order="3" />
    </svg>
  );
}

function Switcher({ variant, onReplay }: Readonly<{ variant: Variant; onReplay: () => void }>) {
  const keys = Object.keys(VARIANTS) as Variant[];
  const go = (step: number) => {
    const next = keys[(keys.indexOf(variant) + step + keys.length) % keys.length]!;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.location.assign(url.toString());
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        go(-1);
      }
      if (event.key === 'ArrowRight') {
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (import.meta.env.PROD) {
    return null;
  }
  return (
    <div className={styles.switcher} data-prototype-switcher>
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span>
        {variant} — {VARIANTS[variant]}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
      <button type="button" onClick={onReplay}>
        Replay
      </button>
    </div>
  );
}

function Run({ variant, hold, children }: Readonly<{ variant: Variant; hold: number; children: ReactNode }>) {
  const [phase, setPhase] = useState<'waiting' | 'entering' | 'ready'>('waiting');
  const [statusIndex, setStatusIndex] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStatusIndex(1), hold * 0.4),
      setTimeout(() => setStatusIndex(2), hold * 0.7),
      setTimeout(() => setPhase('entering'), hold),
      setTimeout(() => setPhase('ready'), hold + 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [hold]);
  const enter = { A: styles.enterA, B: styles.enterB, C: styles.enterC }[variant];
  return (
    <DarkSchemeIsland>
      <div className={styles.frame} {...darkSchemeIslandAttributes} data-phase={phase}>
        {/* The table mounts at once and stays hidden while waiting, the way the chunk and the connection load behind the real frame. */}
        <div className={phase === 'waiting' ? styles.table : `${styles.table} ${enter}`}>{children}</div>
        {phase !== 'ready' && (
          <div className={styles.overlay} data-leaving={phase === 'entering'}>
            {variant === 'A' && <TableLines />}
            {variant === 'B' && <div className={styles.dunes} />}
            {variant === 'C' && <div className={styles.pool} />}
            <div className={styles.status}>
              <Text key={statusIndex} role="status" className={styles.statusLine}>
                {STATUSES[statusIndex]}
              </Text>
            </div>
            <Anchor component={Link} to="/play" style={{ pointerEvents: 'auto' }}>
              Back to lobby
            </Anchor>
          </div>
        )}
      </div>
    </DarkSchemeIsland>
  );
}

/** Wraps the demo table: holds the waiting frame for `hold` ms, then animates the table in per variant. */
export function LoadingPrototype({ children }: Readonly<{ children: ReactNode }>) {
  const [{ variant, hold }] = useState(readSearch);
  const [run, setRun] = useState(0);
  return (
    <>
      <Run key={run} variant={variant} hold={hold}>
        {children}
      </Run>
      <Switcher variant={variant} onReplay={() => setRun((n) => n + 1)} />
    </>
  );
}
