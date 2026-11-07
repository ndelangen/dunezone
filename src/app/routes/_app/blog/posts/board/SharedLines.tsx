import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import styles from './SharedLines.module.css';

/*
 * The figure for drawing with shared lines: a corner of a board with one territory, a cut drawn through it, the two names that come of it, and the merge that takes one away.
 * Beside the board, a Spice card or two point at a territory id and show what they find: a highlight on the region that holds the id, or nothing and a warning.
 * The reader steps through with the buttons; nothing moves on its own.
 */

type Point = readonly [number, number];
type Shape = 'whole' | 'left' | 'right' | 'plastic' | 'wind';
type Territory = { shape: Shape; id: string; name: readonly string[]; rock?: boolean };
type Cut = 'none' | 'open' | 'closed';
type Step = { title: string; note: string; cut: Cut; territories: readonly Territory[]; cards: readonly string[] };

const CENTRE = 140;
const RADIUS = 120;

/* The board's corner: two existing lines meet the rim, and the cut runs from the rim down onto the lower one. */
function rim(degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return [CENTRE + RADIUS * Math.cos(angle), CENTRE + RADIUS * Math.sin(angle)];
}
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const xy = (p: Point) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const quad = (control: Point, to: Point) => `Q${xy(control)} ${xy(to)}`;
const arc = (to: Point, sweep: 0 | 1) => `A${RADIUS} ${RADIUS} 0 0 ${sweep} ${xy(to)}`;

const TOP = rim(-55);
const BOTTOM = rim(50);
const WEST = rim(130);
const CUT_START = rim(-115);
const EAST_CONTROL: Point = [168, 140];
const SOUTH_CONTROL: Point = [150, 210];
const CUT_CONTROL: Point = [118, 130];
/* Where the cut lands on the southern line, 0.4 of the way along, and that line's two halves either side of it. */
const CUT_T = 0.4;
const LANDING = lerp(lerp(WEST, SOUTH_CONTROL, CUT_T), lerp(SOUTH_CONTROL, BOTTOM, CUT_T), CUT_T);
const SOUTH_WEST_CONTROL = lerp(WEST, SOUTH_CONTROL, CUT_T);
const SOUTH_EAST_CONTROL = lerp(SOUTH_CONTROL, BOTTOM, CUT_T);

const PATHS: Record<Shape, string> = {
  whole: `M${xy(TOP)} ${quad(EAST_CONTROL, BOTTOM)} ${quad(SOUTH_CONTROL, WEST)} ${arc(TOP, 1)} Z`,
  left: `M${xy(CUT_START)} ${quad(CUT_CONTROL, LANDING)} ${quad(SOUTH_WEST_CONTROL, WEST)} ${arc(CUT_START, 1)} Z`,
  right: `M${xy(CUT_START)} ${arc(TOP, 1)} ${quad(EAST_CONTROL, BOTTOM)} ${quad(SOUTH_EAST_CONTROL, LANDING)} ${quad(CUT_CONTROL, CUT_START)} Z`,
  plastic: `M${xy(TOP)} ${quad(EAST_CONTROL, BOTTOM)} ${arc(TOP, 0)} Z`,
  wind: `M${xy(WEST)} ${quad(SOUTH_CONTROL, BOTTOM)} ${arc(WEST, 1)} Z`,
};
const LINES = `M${xy(TOP)} ${quad(EAST_CONTROL, BOTTOM)} M${xy(WEST)} ${quad(SOUTH_CONTROL, BOTTOM)}`;
const CUT = `M${xy(CUT_START)} ${quad(CUT_CONTROL, LANDING)}`;

/** Where each territory's name sits. */
const LABELS: Record<Shape, Point> = {
  whole: [150, 118],
  left: [68, 142],
  right: [160, 118],
  plastic: [226, 134],
  wind: [140, 240],
};

const SHAPES: readonly Shape[] = ['whole', 'left', 'right', 'plastic', 'wind'];

const PLASTIC: Territory = { shape: 'plastic', id: 'plastic_basin', name: ['Plastic', 'basin'], rock: true };
const WIND: Territory = { shape: 'wind', id: 'wind_pass', name: ['Wind pass'] };
const HAGGA: Territory = { shape: 'whole', id: 'hagga_basin', name: ['Hagga basin'] };

const STEPS: readonly Step[] = [
  {
    title: 'One territory, one name',
    note: 'The name makes the id. A Spice card points at the id.',
    cut: 'none',
    territories: [HAGGA, PLASTIC, WIND],
    cards: ['hagga_basin'],
  },
  {
    title: 'An unfinished cut',
    note: 'The line is saved and drawn, but it closes nothing. Still one territory.',
    cut: 'open',
    territories: [HAGGA, PLASTIC, WIND],
    cards: ['hagga_basin'],
  },
  {
    title: 'The cut closes',
    note: 'Two territories. One keeps the name and id; the other gets a suggested name.',
    cut: 'closed',
    territories: [
      { shape: 'right', id: 'hagga_basin', name: ['Hagga basin'] },
      { shape: 'left', id: 'hagga_basin_2', name: ['Hagga basin 2'] },
      PLASTIC,
      WIND,
    ],
    cards: ['hagga_basin', 'hagga_basin_2'],
  },
  {
    title: 'Delete the line',
    note: 'The two merge and the first name survives. A card pointing at the other finds nothing.',
    cut: 'none',
    territories: [HAGGA, PLASTIC, WIND],
    cards: ['hagga_basin', 'hagga_basin_2'],
  },
  {
    title: 'Rename it',
    note: 'The name changes, the id stays, and the card still finds it.',
    cut: 'none',
    territories: [{ shape: 'whole', id: 'hagga_basin', name: ['Hagga flats'] }, PLASTIC, WIND],
    cards: ['hagga_basin', 'hagga_basin_2'],
  },
];

const CUT_CLASS: Record<Cut, string> = {
  none: styles.cutNone,
  open: styles.cutOpen,
  closed: styles.cutClosed,
};

/**
 * The corner of the board at one step: every region is always drawn and the ones not in play are faded out, so a cut or a merge is a cross-fade and the cut line draws itself.
 * `highlight` is the region a card lights;
 * the compact form is the card's own small copy, without names.
 */
function BoardArt({ step, highlight, compact = false }: { step: Step; highlight?: Shape; compact?: boolean }) {
  const present = new Map(step.territories.map((territory) => [territory.shape, territory]));
  return (
    <svg viewBox="0 0 280 280" className={clsx(styles.board, compact && styles.compact)} aria-hidden={compact}>
      <circle cx={CENTRE} cy={CENTRE} r={RADIUS} className={styles.disc} />
      {SHAPES.map((shape) => {
        const territory = present.get(shape);
        return (
          <path
            key={shape}
            d={PATHS[shape]}
            className={clsx(styles.region, territory?.rock && styles.rock, !territory && styles.hidden)}
          />
        );
      })}
      {SHAPES.map((shape) => (
        <path key={shape} d={PATHS[shape]} className={clsx(styles.glow, highlight !== shape && styles.hidden)} />
      ))}
      <path d={LINES} className={styles.line} />
      <path d={CUT} pathLength={1} className={clsx(styles.cut, CUT_CLASS[step.cut])} />
      <circle cx={CENTRE} cy={CENTRE} r={RADIUS} className={styles.rim} />
      {compact
        ? null
        : step.territories.map((territory) => {
            const [x, y] = LABELS[territory.shape];
            const top = y - ((territory.name.length - 1) * 11) / 2;
            return (
              <text key={`${territory.shape}:${territory.id}:${territory.name.join()}`} x={x} className={styles.label}>
                {territory.name.map((part, index) => (
                  <tspan key={part} x={x} y={top + index * 11} className={styles.name}>
                    {part}
                  </tspan>
                ))}
                <tspan x={x} y={top + territory.name.length * 11 + 1} className={styles.id}>
                  {territory.id}
                </tspan>
              </text>
            );
          })}
    </svg>
  );
}

/** A Spice card that points at one territory id, with its own small copy of the board lit where that id is, or a warning where it is not. */
function SpiceCard({ step, target }: { step: Step; target: string }) {
  const found = step.territories.find((territory) => territory.id === target);
  return (
    <div className={clsx(styles.card, !found && styles.cardLost)}>
      <span className={styles.eyebrow}>Spice card</span>
      <BoardArt step={step} highlight={found?.shape} compact />
      <span className={styles.target}>{target}</span>
      {found ? (
        <span className={styles.status}>lit on the board</span>
      ) : (
        <span className={clsx(styles.status, styles.warning)}>
          <TriangleAlert size={11} aria-hidden="true" />
          not on this board
        </span>
      )}
    </div>
  );
}

export function SharedLines() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  const highlighted = step.territories.find((territory) => territory.id === 'hagga_basin')?.shape;

  return (
    <div className={styles.root} role="group" aria-label="Drawing a territory with shared lines, step by step">
      <div className={styles.stage}>
        <BoardArt step={step} highlight={highlighted} />
      </div>

      <div className={styles.side}>
        <div className={styles.caption} aria-live="polite">
          <span className={styles.stepNumber}>
            Step {index + 1} of {STEPS.length}
          </span>
          <span className={styles.title}>{step.title}</span>
          <span className={styles.note}>{step.note}</span>
        </div>

        <div className={styles.cards}>
          {step.cards.map((target) => (
            <SpiceCard key={target} step={step} target={target} />
          ))}
        </div>

        <div className={styles.controls}>
          <UnstyledButton
            className={styles.button}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
          >
            Back
          </UnstyledButton>
          <div className={styles.dots} role="group" aria-label="Steps">
            {STEPS.map((entry, dot) => (
              <UnstyledButton
                key={entry.title}
                className={clsx(styles.dot, dot === index && styles.dotOn)}
                aria-label={`Step ${dot + 1}: ${entry.title}`}
                aria-pressed={dot === index}
                onClick={() => setIndex(dot)}
              />
            ))}
          </div>
          <UnstyledButton
            className={styles.button}
            onClick={() => setIndex((current) => Math.min(STEPS.length - 1, current + 1))}
            disabled={index === STEPS.length - 1}
          >
            Next
          </UnstyledButton>
        </div>
      </div>
    </div>
  );
}
