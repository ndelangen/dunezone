import type { CSSProperties } from 'react';
import { useId } from 'react';

import styles from './Machine.module.css';

/*
 * The middle of the faction diagram: where the faction is kept, drawn as a cutaway of a copying machine rather than a database symbol.
 * The ingredients feed in at the top, a browser unit renders the record onto a cloud worker, and the paper path carries it out of the bottom as a PDF or an image.
 * Beside the path sit the storage cassettes: a roller retrieves the record from them, and the images the cloud worker makes are filed back into them.
 * The diagram's lines meet the drawing at the feeder and the outlet, both on the centre line.
 */

const LEFT = -80;
const WIDTH = 520;
const HEIGHT = 258;

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
      <path d={gearPath(cx, cy, outer, outer - Math.min(5, outer * 0.3), teeth)} />
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
function Callout({
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

/** A picture glyph: a frame with a sun and a dune, the sign for a saved image. */
function Picture({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g className={styles.thin}>
      <rect x={x} y={y} width={size} height={size * 0.75} rx="1" />
      <circle cx={x + size * 0.7} cy={y + size * 0.25} r={size * 0.09} />
      <path
        d={`M ${x + 1} ${y + size * 0.7} Q ${x + size * 0.35} ${y + size * 0.3}, ${x + size - 1} ${y + size * 0.68}`}
      />
    </g>
  );
}

export function Machine({ title, subtitle }: { title: string; subtitle: string }) {
  const arrow = `${useId()}-arrow`;

  return (
    <svg
      className={styles.machine}
      viewBox={`${LEFT} 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${title}: ${subtitle}`}
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, '--arrow': `url(#${arrow})` } as CSSProperties}
    >
      <defs>
        <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 Z" className={styles.dot} />
        </marker>
      </defs>

      <g className={styles.ink}>
        {/* The housing, open at the top and bottom where the paper path runs, with its inner wall as a hidden line. */}
        <path d="M 156 18 H 30 V 232 H 168 M 192 232 H 330 V 18 H 204" />
        <path d="M 156 18 L 140 0 M 204 18 L 220 0" />
        <path d="M 36 24 H 324 V 226 H 36 Z" className={styles.hidden} />

        {/* Feed rollers. */}
        <Gear cx={170} cy={32} outer={8} teeth={8} />
        <Gear cx={190} cy={32} outer={8} teeth={8} reverse />

        {/* The browser unit, writing the record onto the cloud worker. */}
        <rect x="138" y="48" width="84" height="20" rx="2" />
        <text x="180" y="61" className={styles.label} textAnchor="middle">
          BROWSER
        </text>
        <path d="M 168 68 L 180 88 M 192 68 L 180 88" className={styles.beam} />

        {/* The cloud worker, turning. */}
        <circle cx="180" cy="124" r="34" />
        <Gear cx={180} cy={124} outer={22} teeth={14} />

        {/* The paper path, flowing from the feeder round the cloud worker and out of the bottom. */}
        <path d="M 180 40 V 90 A 34 34 0 0 1 180 158 V 236" className={styles.flow} />

        {/* The record's plate. */}
        <rect x="48" y="176" width="112" height="42" rx="3" />
        <text x="104" y="191" className={styles.plateSmall}>
          {subtitle.toUpperCase()}
        </text>
        <text x="104" y="208" className={styles.plateTitle}>
          {title.toUpperCase()}
        </text>

        {/* Storage cassettes, with the pick-up roller that retrieves the record for the browser. */}
        {['RECORDS', 'IMAGES', 'PRINTS'].map((label, index) => {
          const y = 110 + index * 34;
          return (
            <g key={label}>
              <path d={`M 240 ${y} H 318 V ${y + 28} H 240 Z M 240 ${y + 6} L 250 ${y}`} />
              <text x="256" y={y + 18} className={styles.label}>
                {label}
              </text>
              {label === 'IMAGES' && <Picture x={298} y={y + 8} size={14} />}
            </g>
          );
        })}
        <Gear cx={236} cy={100} outer={9} teeth={8} reverse />
        <path d="M 230 92 C 222 70, 226 58, 222 58" className={styles.returnPath} />

        {/* Images peel off the paper path back into storage. */}
        <path d="M 186 168 C 200 180, 214 160, 238 160" className={styles.returnPath} />

        {[0, 1, 2].map((lamp) => (
          <circle
            key={lamp}
            cx={56 + lamp * 10}
            cy="40"
            r="2.6"
            className={styles.lamp}
            style={{ animationDelay: `${lamp * 0.3}s` }}
          />
        ))}

        {/* What leaves through the bottom: a PDF one round, an image the next. */}
        {['PDF', 'IMG'].map((label) => (
          <g key={label} className={styles.sheetOut}>
            <path d="M 168 236 H 187 L 192 241 V 254 H 168 Z M 187 236 V 241 H 192" className={styles.page} />
            <text x="180" y="247.5" className={styles.pageLabel}>
              {label}
            </text>
          </g>
        ))}
      </g>

      <Callout from={[222, 58]} to={[350, 60]} text="BROWSER RENDER" anchor="start" />
      <Callout from={[232, 96]} to={[350, 96]} text="RETRIEVAL" anchor="start" />
      <Callout from={[318, 150]} to={[350, 150]} text="STORAGE" anchor="start" />
      <Callout from={[210, 170]} to={[350, 200]} text="IMAGES SAVED" anchor="start" />
      <Callout from={[168, 248]} to={[0, 250]} text="PDF OR IMAGE" anchor="end" />
      <Callout from={[148, 112]} to={[14, 96]} text="CLOUD WORKER" anchor="end" />
    </svg>
  );
}
