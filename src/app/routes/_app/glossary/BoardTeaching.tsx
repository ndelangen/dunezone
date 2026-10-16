import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';

import { RulebookBoardSceneVisual } from '@game/rulebook/RulebookBoardScene';
import type { RulebookBoardScene } from '@game/rulebook/RulebookBoardScene';

import { useTeachingStep, useTeachingTerm } from './teaching';

const board = RULEBOOK_BOARD_DEFINITIONS[0]!;

/* The board's eighteen sectors are 20° wedges around its centre, edged at every multiple of 20°; the inner edge clears the Polar Sink. */
const SECTORS = 18;
const SECTOR_RING = { inner: 0.085, outer: 0.497 };

function ringPoint(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return `${0.5 + radius * Math.cos(radians)} ${0.5 - radius * Math.sin(radians)}`;
}

function sectorPath(sector: number) {
  const from = sector * (360 / SECTORS);
  const to = from + 360 / SECTORS;
  const { inner, outer } = SECTOR_RING;
  return `M ${ringPoint(from, outer)} A ${outer} ${outer} 0 0 0 ${ringPoint(to, outer)} L ${ringPoint(to, inner)} A ${inner} ${inner} 0 0 1 ${ringPoint(from, inner)} Z`;
}

/* The maintained geometry outlines territories; the sector wedges are added beside them so a scene can highlight one by key. */
const geometry: ComponentGeometry = {
  ...board.geometry,
  parts: [
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
  ],
};

const GROUPS = new Set(['strongholds', 'rock', 'sand', 'sectors']);

/* Every single territory, in the order a sweep counterclockwise from the east edge meets it. */
const TERRITORIES = board.geometry.parts
  .filter((part) => !GROUPS.has(part.key) && part.highlight)
  .map((part) => ({
    key: part.key,
    angle: (Math.atan2(0.5 - (part.y + part.height / 2), part.x + part.width / 2 - 0.5) * 180) / Math.PI,
  }))
  .sort((a, b) => ((a.angle + 360) % 360) - ((b.angle + 360) % 360))
  .map((part) => part.key);

const STRONGHOLDS = ['arrakeen', 'carthag', 'tueks', 'tabr', 'habbanya'];
const ORNITHOPTER_FLIGHT = ['carthag', 'tsimpo', 'plastic-basin', 'tabr'];

const COLOR = {
  territory: '#d9822b',
  sector: '#215f89',
  stronghold: '#b8432a',
  sand: '#e3a93b',
  rock: '#7a5236',
  polar: '#2f8aa3',
  flight: '#215f89',
};

type Frame = Pick<RulebookBoardScene, 'highlights' | 'storm' | 'routes'>;

const still: Frame = { highlights: [] };

/* The storm steps counterclockwise one sector at a time, centred on each wedge. */
function stormAt(step: number) {
  return { angle: (step % SECTORS) * (360 / SECTORS) + 360 / SECTORS / 2 };
}

/* Each demonstration is a list of frames played in a loop; a single frame holds still. */
type Demonstration = { frames: (step: number) => Frame; steps: number; interval?: number };

const DEMONSTRATIONS: Record<string, Demonstration> = {
  territory: {
    steps: TERRITORIES.length,
    interval: 450,
    frames: (step) => ({ highlights: [{ territory: TERRITORIES[step]!, color: COLOR.territory, opacity: 0.55 }] }),
  },
  sector: {
    steps: SECTORS,
    interval: 500,
    frames: (step) => ({ highlights: [{ territory: `sector-${step}`, color: COLOR.sector, opacity: 0.45 }] }),
  },
  storm: { steps: SECTORS, interval: 500, frames: (step) => ({ highlights: [], storm: stormAt(step) }) },
  stronghold: {
    steps: STRONGHOLDS.length + 2,
    interval: 600,
    frames: (step) => ({
      highlights: (step < STRONGHOLDS.length ? [STRONGHOLDS[step]!] : STRONGHOLDS).map((territory) => ({
        territory,
        color: COLOR.stronghold,
        opacity: 0.6,
      })),
    }),
  },
  'sand-territory': {
    steps: SECTORS,
    interval: 500,
    frames: (step) => ({ highlights: [{ territory: 'sand', color: COLOR.sand, opacity: 0.45 }], storm: stormAt(step) }),
  },
  'rock-territory': {
    steps: SECTORS,
    interval: 500,
    frames: (step) => ({ highlights: [{ territory: 'rock', color: COLOR.rock, opacity: 0.6 }], storm: stormAt(step) }),
  },
  'polar-sink': {
    steps: SECTORS,
    interval: 500,
    frames: (step) => ({
      highlights: [{ territory: 'polar', color: COLOR.polar, opacity: 0.6 }],
      storm: stormAt(step),
    }),
  },
  ornithopter: {
    steps: ORNITHOPTER_FLIGHT.length + 1,
    interval: 900,
    frames: (step) => {
      const reached = Math.min(step, ORNITHOPTER_FLIGHT.length - 1);
      return {
        highlights: ORNITHOPTER_FLIGHT.slice(0, reached + 1).map((territory, index) => ({
          territory,
          color: COLOR.flight,
          opacity: index === reached ? 0.6 : 0.2,
        })),
        routes:
          reached > 0
            ? [
                {
                  id: 'ornithopter',
                  label: 'Three territories by ornithopter',
                  color: COLOR.flight,
                  direction: 'forward' as const,
                  showWaypoints: false,
                  waypoints: ORNITHOPTER_FLIGHT.slice(0, reached + 1).map((territory) => ({ territory })),
                },
              ]
            : undefined,
      };
    },
  },
};

const IDLE: Demonstration = { steps: 1, frames: () => still };

/** The board of Arrakis, demonstrating whichever board term the reader is pointing at. */
export function BoardTeaching() {
  const term = useTeachingTerm();
  const demonstration = (term && DEMONSTRATIONS[term]) || IDLE;
  const step = useTeachingStep(demonstration !== IDLE, demonstration.steps, demonstration.interval);
  const frame = demonstration.frames(step);
  return (
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
          geometry,
        },
        players: [],
        troops: [],
        annotations: [],
        ...frame,
      }}
    />
  );
}
