import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import { useId } from 'react';
import type { SVGProps } from 'react';

import { RulebookBoardSceneVisual } from '@game/rulebook/RulebookBoardScene';
import type { RulebookBoardScene } from '@game/rulebook/RulebookBoardScene';

import styles from './BoardTeaching.module.css';
import { useTeachingRun, useTeachingStep, useTeachingTerm } from './teaching';

const board = RULEBOOK_BOARD_DEFINITIONS[0]!;

/* The board's eighteen sectors are 20° wedges around its centre, edged at every multiple of 20°; the inner edge clears the Polar Sink. */
const SECTORS = 18;
const SECTOR_DEGREES = 360 / SECTORS;
const SECTOR_RING = { inner: 0.085, outer: 0.497 };

function ringPoint(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return `${0.5 + radius * Math.cos(radians)} ${0.5 - radius * Math.sin(radians)}`;
}

function sectorPath(sector: number) {
  const from = sector * SECTOR_DEGREES;
  const to = from + SECTOR_DEGREES;
  const { inner, outer } = SECTOR_RING;
  return `M ${ringPoint(from, outer)} A ${outer} ${outer} 0 0 0 ${ringPoint(to, outer)} L ${ringPoint(to, inner)} A ${inner} ${inner} 0 0 1 ${ringPoint(from, inner)} Z`;
}

/* The maintained geometry outlines territories; the sector wedges are added beside them so the picture can light one by key. */
const parts: ComponentGeometry['parts'] = [
  ...board.geometry.parts,
  ...Array.from({ length: SECTORS }, (_, sector) => ({
    key: `sector-${sector}`,
    label: `Sector ${sector + 1}`,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    highlight: { paths: [{ d: sectorPath(sector) }] },
  })),
];

const GROUPS = new Set(['strongholds', 'rock', 'sand', 'sectors', 'polar']);
const TERRITORIES = board.geometry.parts
  .filter((part) => !GROUPS.has(part.key) && part.highlight)
  .map((part) => part.key);
const STRONGHOLDS = ['arrakeen', 'carthag', 'tueks', 'tabr', 'habbanya'];
const ORNITHOPTER_FLIGHT = ['carthag', 'tsimpo', 'plastic-basin', 'tabr'];

const COLOR = {
  territory: '#ff7a1a',
  sector: '#3aa0e0',
  stronghold: '#e0442a',
  sand: '#ffc640',
  rock: '#a0643c',
  polar: '#3cc0e0',
  flight: '#3aa0e0',
};

/* The same seed always shuffles the same way, so each new pointing gets its own order and keeps it while it plays. */
function shuffled<T>(items: readonly T[], seed: number) {
  let state = Math.floor(seed * 2 ** 32) >>> 0;
  const random = () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
  const order = [...items];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

type Lit = { key: string; color: string; faint?: boolean };

type Frame = {
  lit: readonly Lit[];
  /** Lit pieces blink on and off instead of holding still. */
  blink?: boolean;
  /** How many three-sector moves the storm has made, counted from sector 1; never wraps, so the storm never turns back. */
  storm?: number;
  routes?: RulebookBoardScene['routes'];
};

type Demonstration = { frames: (step: number, run: number) => Frame; steps: number; interval?: number };

const DEMONSTRATIONS: Record<string, Demonstration> = {
  territory: {
    steps: TERRITORIES.length,
    interval: 550,
    frames: (step, run) => ({ lit: [{ key: shuffled(TERRITORIES, run)[step]!, color: COLOR.territory }] }),
  },
  sector: {
    steps: SECTORS,
    interval: 500,
    frames: (step) => ({ lit: [{ key: `sector-${step}`, color: COLOR.sector }] }),
  },
  /* The storm moves three sectors at a time; the step count is large so its count only climbs while a reader watches. */
  storm: { steps: 10_000, interval: 1400, frames: (step) => ({ lit: [], storm: step }) },
  stronghold: {
    steps: STRONGHOLDS.length + 2,
    interval: 650,
    frames: (step) => ({
      lit: (step < STRONGHOLDS.length ? [STRONGHOLDS[step]!] : STRONGHOLDS).map((key) => ({
        key,
        color: COLOR.stronghold,
      })),
    }),
  },
  'sand-territory': { steps: 1, frames: () => ({ lit: [{ key: 'sand', color: COLOR.sand }], blink: true }) },
  'rock-territory': { steps: 1, frames: () => ({ lit: [{ key: 'rock', color: COLOR.rock }], blink: true }) },
  'polar-sink': { steps: 1, frames: () => ({ lit: [{ key: 'polar', color: COLOR.polar }], blink: true }) },
  ornithopter: {
    steps: ORNITHOPTER_FLIGHT.length + 1,
    interval: 900,
    frames: (step) => {
      const reached = Math.min(step, ORNITHOPTER_FLIGHT.length - 1);
      const flown = ORNITHOPTER_FLIGHT.slice(0, reached + 1);
      return {
        lit: flown.map((key, index) => ({ key, color: COLOR.flight, faint: index !== reached })),
        routes:
          reached > 0
            ? [
                {
                  id: 'ornithopter',
                  label: 'Three territories by ornithopter',
                  color: COLOR.flight,
                  direction: 'forward' as const,
                  showWaypoints: false,
                  waypoints: flown.map((territory) => ({ territory })),
                },
              ]
            : undefined,
      };
    },
  },
};

const IDLE: Demonstration = { steps: 1, frames: () => ({ lit: [] }) };

function PartPaths({ partKey, ...props }: { partKey: string } & SVGProps<SVGPathElement>) {
  const part = parts.find(({ key }) => key === partKey);
  return part?.highlight?.paths.map((path, index) => (
    <path
      key={index}
      d={path.d}
      transform={path.transform ? `matrix(${path.transform.join(' ')})` : undefined}
      {...props}
    />
  ));
}

/* The storm's wedge and marker, turned counterclockwise around the board's centre; the move between positions eases in and out. */
function Storm({ moves }: { moves: number }) {
  return (
    <g className={styles.storm} style={{ transform: `rotate(${-moves * 3 * SECTOR_DEGREES}deg)` }}>
      <path d={sectorPath(0)} className={styles.stormWedge} />
      <g transform={`translate(${ringPoint(SECTOR_DEGREES / 2, 0.44)})`}>
        <circle r="0.03" className={styles.stormMarker} />
        <image href="/vector/icon/storrm_standalone.svg" x="-0.022" y="-0.022" width="0.044" height="0.044" />
      </g>
    </g>
  );
}

/*
 * What the demonstration lights is drawn above the board: the rest of the map darkens,
 * and each lit piece gets a bright fill and a light edge so it reads at a glance.
 */
function Spotlight({ frame }: { frame: Frame }) {
  const strong = frame.lit.filter((lit) => !lit.faint);
  const mask = useId().replaceAll(':', '');
  return (
    <svg className={styles.overlay} viewBox="0 0 1 1" aria-hidden="true" data-blink={frame.blink || undefined}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
          <rect width="1" height="1" fill="white" />
          {strong.map((lit) => (
            <PartPaths key={lit.key} partKey={lit.key} fill="black" />
          ))}
        </mask>
      </defs>
      {strong.length > 0 && !frame.blink ? (
        <circle cx="0.5" cy="0.5" r="0.5" className={styles.shade} mask={`url(#${mask})`} />
      ) : null}
      {frame.lit.map((lit) => (
        <g key={lit.key} className={styles.lit} data-faint={lit.faint || undefined} style={{ color: lit.color }}>
          <PartPaths partKey={lit.key} />
        </g>
      ))}
      {frame.storm !== undefined ? <Storm moves={frame.storm} /> : null}
    </svg>
  );
}

/** The board of Arrakis, demonstrating whichever board term the reader is pointing at. */
export function BoardTeaching() {
  const term = useTeachingTerm();
  const run = useTeachingRun();
  const demonstration = (term && DEMONSTRATIONS[term]) || IDLE;
  const step = useTeachingStep(demonstration !== IDLE, demonstration.steps, demonstration.interval);
  const frame = demonstration.frames(step, run);
  return (
    <div className={styles.teaching}>
      <RulebookBoardSceneVisual
        scene={{
          boardId: board.id,
          caption: '',
          size: 'fit-width',
          viewport: { x: 0, y: 0, width: 1, height: 1 },
          board: {
            status: 'ready',
            reference: { kind: 'board', boardId: board.id },
            name: 'The board of Arrakis, divided into sectors and territories',
            imageUrl: board.imageUrl,
            geometry: board.geometry,
          },
          players: [],
          troops: [],
          annotations: [],
          highlights: [],
          routes: frame.routes,
        }}
      />
      <Spotlight frame={frame} />
    </div>
  );
}
