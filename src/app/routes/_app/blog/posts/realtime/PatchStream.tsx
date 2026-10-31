import clsx from 'clsx';
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import styles from './PatchStream.module.css';
import { useSteps } from './useSteps';

/*
 * The figure for how a browser is kept in step: the frames that reach it, one patch after another, and what happens when one is missing.
 * Each patch is built on the last frame the browser received (`baseSequence` to `sequence`); a gap means a patch it cannot apply, so it asks for a full view and waits.
 * Under it, the sizes measured on a test table in September 2026, as raw JSON bytes.
 */

type Frame =
  | { kind: 'patch'; from: number; to: number }
  | { kind: 'gap'; from: number; to: number }
  | { kind: 'sync' }
  | { kind: 'full'; at: number };

const FRAMES: readonly Frame[] = [
  { kind: 'patch', from: 41, to: 42 },
  { kind: 'patch', from: 42, to: 43 },
  { kind: 'gap', from: 43, to: 45 },
  { kind: 'sync' },
  { kind: 'full', at: 45 },
  { kind: 'patch', from: 45, to: 46 },
  { kind: 'patch', from: 46, to: 47 },
];

const FULL_VIEW = 24_664;

type Bar = {
  label: string;
  /* The bytes drawn, as a share of the full view; `null` is a size known only in words. */
  bytes: number | null;
  /* A share of the bar that is shaded as waste, with its name. */
  waste?: { share: number; label: string };
  /* A second, smaller bar drawn over the first for a size after a trim. */
  trimmed?: number;
  value: string;
};

const BARS: readonly Bar[] = [
  { label: 'First full view of a test table', bytes: FULL_VIEW, value: '24,664 B' },
  {
    label: 'Dropping a stack of 100 cards, before',
    bytes: 21_680,
    waste: { share: 0.95, label: 'unchanged card data' },
    value: '21,680 B',
  },
  {
    label: 'Dropping a stack of 100 cards, now',
    bytes: null,
    value: 'only the piece id, position, rotation, zone and flip count',
  },
  { label: 'One cursor move', bytes: 495, trimmed: 365, value: '495 B, then 365 B without its unchanged snapshot' },
];

function FrameCard({ frame, shown }: { frame: Frame; shown: boolean }) {
  switch (frame.kind) {
    case 'patch':
      return (
        <li className={clsx(styles.frame, !shown && styles.hidden)}>
          <span className={styles.frameKind}>update</span>
          <span className={styles.frameRange}>
            {frame.from} → {frame.to}
          </span>
        </li>
      );
    case 'gap':
      return (
        <li className={clsx(styles.frame, styles.gap, !shown && styles.hidden)}>
          <span className={styles.frameKind}>update</span>
          <span className={styles.frameRange}>
            {frame.from} → {frame.to}
          </span>
          <span className={styles.frameNote}>gap: {frame.from + 1} never came</span>
        </li>
      );
    case 'sync':
      return (
        <li className={clsx(styles.frame, styles.sync, !shown && styles.hidden)}>
          <span className={styles.frameKind}>browser asks</span>
          <span className={styles.frameRange}>sync</span>
          <span className={styles.frameNote}>commands wait</span>
        </li>
      );
    case 'full':
      return (
        <li className={clsx(styles.frame, styles.full, !shown && styles.hidden)}>
          <span className={styles.frameKind}>full view</span>
          <span className={styles.frameRange}>{frame.at}</span>
          <span className={styles.frameNote}>the whole table</span>
        </li>
      );
  }
}

export function PatchStream() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { step, armed, seen } = useSteps(rootRef, FRAMES.length, { interval: 800, loop: true, pause: 5 });
  /* The revision the browser stands at: it stays at 43 while the gap and the sync are in the air. */
  const revision = step <= 2 ? 41 + step : step <= 4 ? 43 : 40 + step;

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, armed && !seen && styles.waiting)}
      role="group"
      aria-label="Updates arriving at one browser, and how big each kind is"
    >
      <div className={styles.stream}>
        <ol className={styles.frames}>
          {FRAMES.map((frame, index) => (
            <FrameCard key={index} frame={frame} shown={index < step} />
          ))}
        </ol>
        <div className={styles.browser} aria-hidden="true">
          <span className={styles.browserBar} />
          <span className={styles.browserLabel}>your browser</span>
          <span className={styles.revision}>at {revision}</span>
        </div>
      </div>

      <dl className={styles.chart}>
        {BARS.map((bar, index) => (
          <div key={bar.label} className={styles.barRow} style={{ '--row': index } as CSSProperties}>
            <dt className={styles.barLabel}>{bar.label}</dt>
            <dd className={styles.barCell}>
              {bar.bytes === null ? (
                <span className={styles.barUnknown} />
              ) : (
                <span className={styles.bar} style={{ '--share': bar.bytes / FULL_VIEW } as CSSProperties}>
                  {bar.waste ? (
                    <span className={styles.waste} style={{ '--share': bar.waste.share } as CSSProperties}>
                      <span className={styles.wasteLabel}>{bar.waste.label}</span>
                    </span>
                  ) : null}
                  {bar.trimmed ? (
                    <span className={styles.trim} style={{ '--share': bar.trimmed / bar.bytes } as CSSProperties} />
                  ) : null}
                </span>
              )}
              <span className={styles.value}>{bar.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
