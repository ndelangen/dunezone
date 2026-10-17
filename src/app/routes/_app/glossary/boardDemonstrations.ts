import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';

import type { RulebookBoardScene } from '@game/rulebook/RulebookBoardScene';

export const board = RULEBOOK_BOARD_DEFINITIONS[0]!;

/* The board's eighteen sectors are 20° wedges around its centre, edged at every multiple of 20°; the inner edge clears the Polar Sink. */
const SECTORS = 18;
export const SECTOR_DEGREES = 360 / SECTORS;
const SECTOR_RING = { inner: 0.085, outer: 0.497 };

export function ringPoint(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return `${0.5 + radius * Math.cos(radians)} ${0.5 - radius * Math.sin(radians)}`;
}

export function sectorPath(sector: number) {
  const from = sector * SECTOR_DEGREES;
  const to = from + SECTOR_DEGREES;
  const { inner, outer } = SECTOR_RING;
  return `M ${ringPoint(from, outer)} A ${outer} ${outer} 0 0 0 ${ringPoint(to, outer)} L ${ringPoint(to, inner)} A ${inner} ${inner} 0 0 1 ${ringPoint(from, inner)} Z`;
}

/* The maintained geometry outlines territories; the sector wedges are added beside them so the picture can light one by key. */
export const parts: ComponentGeometry['parts'] = [
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
export function shuffled<T>(items: readonly T[], seed: number) {
  let state = seed >>> 0;
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

export type Frame = {
  lit: readonly Lit[];
  /** Lit pieces blink on and off instead of holding still. */
  blink?: boolean;
  /** How many three-sector moves the storm has made, counted from sector 1; never wraps, so the storm never turns back. */
  storm?: number;
  routes?: RulebookBoardScene['routes'];
};

export type Demonstration = { frames: (step: number, run: number) => Frame; steps: number; interval?: number };

export const DEMONSTRATIONS: Record<string, Demonstration> = {
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

export const IDLE: Demonstration = { steps: 1, frames: () => ({ lit: [] }) };
