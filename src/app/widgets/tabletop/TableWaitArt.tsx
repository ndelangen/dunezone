import type { CSSProperties } from 'react';

import styles from './TableWait.module.css';

/** The looks the waiting frame can take while a table loads. */
export const TABLE_WAIT_LOOKS = ['pool', 'storm', 'board', 'worm', 'thumper', 'moons', 'dunes'] as const;
export type TableWaitLook = (typeof TABLE_WAIT_LOOKS)[number];

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/* A small seeded generator, so the scattered grains and stars sit in the same places on every render and every capture. */
function scatter(count: number, seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
  return Array.from({ length: count }, (_, index) => ({ index, a: next(), b: next(), c: next() }));
}

const SECTORS = Array.from({ length: 18 }, (_, index) => index);

/* A wedge of the board's disc, sector `index` of 18, in a 200-unit box centred on 100,100. */
function wedge(index: number, inner: number, outer: number) {
  const step = (Math.PI * 2) / 18;
  const from = index * step - Math.PI / 2;
  const to = from + step;
  const point = (radius: number, angle: number) =>
    `${(100 + radius * Math.cos(angle)).toFixed(2)} ${(100 + radius * Math.sin(angle)).toFixed(2)}`;
  return `M ${point(inner, from)} L ${point(outer, from)} A ${outer} ${outer} 0 0 1 ${point(outer, to)} L ${point(inner, to)} A ${inner} ${inner} 0 0 0 ${point(inner, from)} Z`;
}

/** The storm: a front sweeps the eighteen sectors of the rim, and each sector flares as it passes. */
function Storm() {
  return (
    <div className={styles.emblem} data-art="storm">
      <div className={styles.stormFront} />
      <svg viewBox="0 0 200 200" className={styles.fill} aria-hidden>
        <circle cx="100" cy="100" r="96" className={styles.stormRim} />
        <circle cx="100" cy="100" r="62" className={styles.stormRim} />
        {SECTORS.map((index) => (
          <path
            key={index}
            d={wedge(index, 66, 92)}
            className={styles.stormSector}
            style={{ '--wait-i': index } as Vars}
          />
        ))}
      </svg>
      {scatter(28, 7).map(({ index, a, b, c }) => (
        <span
          key={index}
          className={styles.stormGrain}
          style={{ '--wait-angle': `${a * 360}deg`, '--wait-i': (b + c) * 9 } as Vars}
        />
      ))}
      <div className={styles.stormEye} />
    </div>
  );
}

/** The board: its eighteen sectors fall into place one by one, glint once whole, and lift away to start again. */
function Board() {
  return (
    <div className={styles.emblem} data-art="board">
      <div className={styles.boardGlow} />
      <svg viewBox="0 0 200 200" className={styles.fill} aria-hidden>
        <circle cx="100" cy="100" r="97" className={styles.boardRim} />
        {SECTORS.map((index) => (
          <path
            key={index}
            d={wedge(index, 14, 90)}
            className={styles.boardWedge}
            data-tone={index % 3}
            style={{ '--wait-i': index } as Vars}
          />
        ))}
        <circle cx="100" cy="100" r="12" className={styles.boardHub} />
      </svg>
      <div className={styles.boardGlint} />
    </div>
  );
}

/** Shai-Hulud: rings of teeth turn against each other around a dark throat, and the sand around it is drawn in. */
function Worm() {
  const ring = (count: number, radius: number, length: number) =>
    Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2;
      const half = Math.PI / count / 1.6;
      const at = (r: number, a: number) =>
        `${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`;
      return (
        <polygon
          key={index}
          points={`${at(radius, angle - half)} ${at(radius - length, angle)} ${at(radius, angle + half)}`}
        />
      );
    });
  return (
    <div className={styles.emblem} data-art="worm">
      {scatter(36, 11).map(({ index, a, b, c }) => (
        <span
          key={index}
          className={styles.wormGrain}
          style={{ '--wait-angle': `${a * 360}deg`, '--wait-i': b * 10, '--wait-size': `${2 + c * 3}px` } as Vars}
        />
      ))}
      <div className={styles.wormThroat} />
      <svg viewBox="0 0 200 200" className={`${styles.fill} ${styles.wormRing}`} data-ring="outer" aria-hidden>
        {ring(30, 92, 20)}
      </svg>
      <svg viewBox="0 0 200 200" className={`${styles.fill} ${styles.wormRing}`} data-ring="middle" aria-hidden>
        {ring(24, 70, 17)}
      </svg>
      <svg viewBox="0 0 200 200" className={`${styles.fill} ${styles.wormRing}`} data-ring="inner" aria-hidden>
        {ring(16, 48, 14)}
      </svg>
    </div>
  );
}

/** The thumper: a steady beat sends rings across rippled sand, and every fourth beat something answers. */
function Thumper() {
  return (
    <div className={styles.emblem} data-art="thumper">
      <div className={styles.thumperSand} />
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className={styles.thumperWave} style={{ '--wait-i': index } as Vars} />
      ))}
      <span className={styles.thumperAnswer} />
      <div className={styles.thumperPost} />
    </div>
  );
}

/** Arrakis and its two moons, on tilted orbits through a field of slow stars. */
function Moons() {
  return (
    <div className={styles.emblem} data-art="moons">
      {scatter(40, 23).map(({ index, a, b, c }) => (
        <span
          key={index}
          className={styles.star}
          style={{ '--wait-x': `${a * 160 - 30}%`, '--wait-y': `${b * 160 - 30}%`, '--wait-i': c * 6 } as Vars}
        />
      ))}
      <div className={styles.orbit} data-orbit="near">
        <span className={styles.moon} />
      </div>
      <div className={styles.planet} />
      <div className={styles.orbit} data-orbit="far">
        <span className={styles.moon} />
      </div>
    </div>
  );
}

/* A dune ridge wide enough to tile: one crest per 400 units, drawn twice so the drift wraps without a seam. */
function ridge(height: number, swell: number, phase: number) {
  let path = `M 0 ${height}`;
  for (let x = 0; x <= 800; x += 20) {
    const crest =
      Math.sin(((x + phase) / 400) * Math.PI * 2) * swell +
      Math.sin(((x + phase) / 133.33) * Math.PI * 2) * swell * 0.25;
    path += ` L ${x} ${(height - crest).toFixed(1)}`;
  }
  return `${path} L 800 200 L 0 200 Z`;
}

/** The deep desert: dune ridges drift past at their own depths under a low sun, with sand blowing off the crests. */
function Dunes() {
  return (
    <div className={styles.dunes} data-art="dunes">
      <div className={styles.sun} />
      {[
        { layer: 0, height: 60, swell: 18, phase: 0 },
        { layer: 1, height: 70, swell: 24, phase: 120 },
        { layer: 2, height: 80, swell: 30, phase: 260 },
      ].map(({ layer, height, swell, phase }) => (
        <svg
          key={layer}
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          className={styles.dune}
          data-layer={layer}
          aria-hidden
        >
          <path d={ridge(height, swell, phase)} />
        </svg>
      ))}
      {scatter(30, 31).map(({ index, a, b, c }) => (
        <span
          key={index}
          className={styles.drift}
          style={{ '--wait-y': `${58 + a * 40}%`, '--wait-i': b * 4, '--wait-w': `${30 + c * 90}px` } as Vars}
        />
      ))}
    </div>
  );
}

const ART: Record<Exclude<TableWaitLook, 'pool'>, () => React.JSX.Element> = {
  storm: Storm,
  board: Board,
  worm: Worm,
  thumper: Thumper,
  moons: Moons,
  dunes: Dunes,
};

/** The moving art behind and above the status line; the original pool of light draws in the frame's own ground. */
export function TableWaitArt({ look }: Readonly<{ look: TableWaitLook }>) {
  if (look === 'pool') {
    return null;
  }
  const Art = ART[look];
  return <Art />;
}
