import { useId } from 'react';

import styles from './Machine.module.css';

/*
 * The middle of the faction diagram: the place the faction is kept, drawn as a blueprint of a small machine rather than a database symbol, so a reader without a programming background sees "it goes in here, and everything comes out of here".
 * Ingredients drop into the intake on top, the screen shows the one record it holds, and the assets leave through the outlet below; the diagram's lines meet the intake and the outlet at the drawing's centre line.
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

export function Gear({
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
      <path d={gearPath(cx, cy, outer, outer - 5, teeth)} />
      <circle cx={cx} cy={cy} r={outer * 0.45} className={styles.thin} />
      <circle cx={cx} cy={cy} r={outer * 0.14} />
      <path
        d={`M ${cx - outer * 0.45} ${cy} H ${cx + outer * 0.45} M ${cx} ${cy - outer * 0.45} V ${cy + outer * 0.45}`}
        className={styles.thin}
      />
    </g>
  );
}

/** A label off to the side, joined to the part it names by a leader line ending in a dot. */
export function Callout({
  from,
  to,
  text,
  anchor,
}: {
  from: [number, number];
  to: [number, number];
  text: string;
  anchor: 'start' | 'end';
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  return (
    <g className={styles.callout}>
      <circle cx={x1} cy={y1} r="1.6" className={styles.dot} />
      <path d={`M ${x1} ${y1} L ${x2} ${y2} H ${x2 + (anchor === 'start' ? 6 : -6)}`} className={styles.thin} />
      <text x={x2 + (anchor === 'start' ? 9 : -9)} y={y2 + 2.5} textAnchor={anchor} className={styles.note}>
        {text}
      </text>
    </g>
  );
}

export function Machine({ title, subtitle }: { title: string; subtitle: string }) {
  const id = useId();
  const grid = `${id}-grid`;

  return (
    <svg
      className={styles.machine}
      viewBox={`-80 0 ${WIDTH + 160} ${HEIGHT}`}
      role="img"
      aria-label={`${title}: ${subtitle}`}
      style={{ aspectRatio: `${WIDTH + 160} / ${HEIGHT}` }}
    >
      <defs>
        <pattern id={grid} width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 H 0 V 10" className={styles.gridLine} />
        </pattern>
      </defs>

      {/* Blueprint paper behind the body, with a fine grid. */}
      <rect x="20" y="40" width="320" height="164" rx="12" className={styles.paper} />
      <rect x="20" y="40" width="320" height="164" rx="12" fill={`url(#${grid})`} />

      <g className={styles.ink}>
        {/* The intake the ingredients drop into, on a short neck into the body. */}
        <path d="M 128 2 H 232 L 208 30 H 152 Z" />
        <path d="M 160 30 V 40 M 200 30 V 40" />
        <path d="M 140 8 H 220" className={styles.hidden} />

        {/* The body, with an inner panel line and fixings. */}
        <rect x="20" y="40" width="320" height="164" rx="12" />
        <rect x="28" y="48" width="304" height="148" rx="8" className={styles.thin} />
        {(
          [
            [34, 54],
            [326, 54],
            [34, 190],
            [326, 190],
          ] as const
        ).map(([cx, cy]) => (
          <g key={`${cx}-${cy}`} className={styles.thin}>
            <circle cx={cx} cy={cy} r="3" />
            <path d={`M ${cx - 2} ${cy} H ${cx + 2}`} />
          </g>
        ))}

        {/* Gears turning on either side, with the shafts that join them drawn as hidden lines. */}
        <path d="M 62 102 L 86 150 M 300 98 L 292 148" className={styles.hidden} />
        <Gear cx={62} cy={102} outer={26} teeth={12} />
        <Gear cx={86} cy={150} outer={16} teeth={8} reverse />
        <Gear cx={300} cy={98} outer={20} teeth={10} reverse />
        <Gear cx={292} cy={148} outer={24} teeth={11} />

        {/* The screen with the one record it holds. */}
        <rect x="112" y="62" width="136" height="78" rx="4" />
        <rect x="118" y="68" width="124" height="66" rx="2" className={styles.thin} />
        <text x="180" y="86" className={styles.screenSmall}>
          {subtitle.toUpperCase()}
        </text>
        <text x="180" y="110" className={styles.screenTitle}>
          {title.toUpperCase()}
        </text>
        <path d="M 152 120 H 206" className={styles.thin} />
        <rect x="210" y="116" width="5" height="7" className={styles.cursor} />

        {/* Indicator lamps and a dial. */}
        {[140, 158, 176, 194, 212].map((cx, index) => (
          <circle
            key={cx}
            cx={cx}
            cy="160"
            r="4"
            className={styles.lamp}
            style={{ animationDelay: `${index * 0.22}s` }}
          />
        ))}
        <circle cx="236" cy="168" r="11" />
        <path d="M 236 168 L 243 162" className={styles.needle} style={{ transformOrigin: '236px 168px' }} />
        <path d="M 120 178 H 214 M 120 184 H 190" className={styles.hidden} />

        {/* The outlet the assets leave through. */}
        <path d="M 160 204 V 214 M 200 204 V 214" />
        <path d="M 146 214 H 214 L 206 228 H 154 Z" />
      </g>

      <Callout from={[230, 10]} to={[262, 16]} text="INTAKE" anchor="start" />
      <Callout from={[112, 75]} to={[6, 30]} text="ONE RECORD" anchor="end" />
      <Callout from={[45, 85]} to={[6, 140]} text="DRIVE" anchor="end" />
      <Callout from={[216, 160]} to={[362, 150]} text="STATUS" anchor="start" />
      <Callout from={[206, 222]} to={[262, 228]} text="OUTLET" anchor="start" />
    </svg>
  );
}
