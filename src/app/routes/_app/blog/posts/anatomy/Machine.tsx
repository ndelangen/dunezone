import { useId } from 'react';

import styles from './Machine.module.css';

/*
 * The middle of the faction diagram: the place the faction is kept, drawn as a small machine rather than a database symbol, so a reader without a programming background sees "it goes in here, and everything comes out of here".
 * Ingredients drop into the hopper on top, the screen shows the one record it holds, and the assets leave through the chute below; the diagram's lines meet the hopper and the chute at the drawing's centre line.
 */

const WIDTH = 360;
const HEIGHT = 230;

/** A gear outline: `teeth` flat-topped teeth between radius `inner` and `outer`, as one closed path around (`cx`, `cy`). */
function gearPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const step = (Math.PI * 2) / teeth;
  const points: string[] = [];
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const start = tooth * step;
    const corners: readonly [number, number][] = [
      [start, inner],
      [start + step * 0.15, outer],
      [start + step * 0.5, outer],
      [start + step * 0.65, inner],
    ];
    for (const [angle, radius] of corners) {
      points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`);
    }
  }
  return `M ${points.join(' L ')} Z`;
}

function Gear({
  cx,
  cy,
  outer,
  teeth,
  reverse = false,
}: {
  cx: number;
  cy: number;
  outer: number;
  teeth: number;
  reverse?: boolean;
}) {
  return (
    <g className={reverse ? styles.gearReverse : styles.gear} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <path d={gearPath(cx, cy, outer, outer - 5, teeth)} className={styles.brass} />
      <circle cx={cx} cy={cy} r={outer * 0.45} className={styles.hole} />
      <circle cx={cx} cy={cy} r={outer * 0.16} className={styles.brass} />
    </g>
  );
}

const RIVETS: readonly [number, number][] = [
  [32, 50],
  [328, 50],
  [32, 192],
  [328, 192],
  [180, 50],
  [180, 192],
];

export function Machine({ title, subtitle }: { title: string; subtitle: string }) {
  const id = useId();
  const steel = `${id}-steel`;
  const glow = `${id}-glow`;

  return (
    <svg
      className={styles.machine}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${title}: ${subtitle}`}
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    >
      <defs>
        <linearGradient id={steel} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4250" />
          <stop offset="0.5" stopColor="#262b35" />
          <stop offset="1" stopColor="#171a21" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#1d2e1f" />
          <stop offset="1" stopColor="#0a110b" />
        </radialGradient>
      </defs>

      {/* The hopper the ingredients drop into, on a short neck into the body. */}
      <path d="M 128 2 H 232 L 208 30 H 152 Z" className={styles.brass} />
      <path d="M 140 7 H 220" className={styles.groove} />
      <rect x="160" y="30" width="40" height="12" className={styles.pipe} />

      {/* The body. */}
      <rect x="20" y="40" width="320" height="164" rx="12" fill={`url(#${steel})`} className={styles.body} />
      <rect x="28" y="48" width="304" height="148" rx="8" className={styles.panel} />
      {RIVETS.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" className={styles.rivet} />
      ))}

      {/* Gears turning on either side. */}
      <Gear cx={62} cy={102} outer={26} teeth={12} />
      <Gear cx={86} cy={150} outer={16} teeth={8} reverse />
      <Gear cx={300} cy={98} outer={20} teeth={10} reverse />
      <Gear cx={292} cy={148} outer={24} teeth={11} />

      {/* The screen with the one record it holds. */}
      <rect x="112" y="62" width="136" height="78" rx="6" className={styles.bezel} />
      <rect x="118" y="68" width="124" height="66" rx="3" fill={`url(#${glow})`} />
      <text x="180" y="86" className={styles.screenSmall}>
        {subtitle.toUpperCase()}
      </text>
      <text x="180" y="110" className={styles.screenTitle}>
        {title.toUpperCase()}
      </text>
      <rect x="152" y="118" width="56" height="3" className={styles.screenBar} />
      <rect x="211" y="116" width="5" height="7" className={styles.cursor} />

      {/* Indicator lights and a dial. */}
      {[140, 158, 176, 194, 212].map((cx, index) => (
        <circle
          key={cx}
          cx={cx}
          cy="160"
          r="4"
          className={index % 2 === 0 ? styles.lightGreen : styles.lightAmber}
          style={{ animationDelay: `${index * 0.22}s` }}
        />
      ))}
      <circle cx="236" cy="168" r="11" className={styles.dial} />
      <path d="M 236 168 L 243 162" className={styles.needle} style={{ transformOrigin: '236px 168px' }} />
      <path d="M 120 178 H 214" className={styles.groove} />
      <path d="M 120 184 H 190" className={styles.groove} />

      {/* The chute the assets leave through. */}
      <rect x="156" y="204" width="48" height="10" className={styles.pipe} />
      <path d="M 146 214 H 214 L 206 228 H 154 Z" className={styles.brass} />
    </svg>
  );
}
