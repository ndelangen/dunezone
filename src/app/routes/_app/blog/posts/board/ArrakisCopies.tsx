import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import styles from './ArrakisCopies.module.css';
import { useInView, useReducedMotion } from './motion';

/*
 * The figure for where the board lives: before, four places each with a copy of Arrakis of its own; after, one saved board that every place draws from.
 * Switching to "after" sends the four copies into the middle, where the saved board takes their place and its lines reach out to everything that reads it.
 * The figure alternates on its own while the reader is looking, until they press a button, and sits still for a reader who asked for less motion.
 */

type View = 'before' | 'after';
type Point = { x: number; y: number };

/** A place that kept its own copy of the board, and what that copy was. */
type Source = { title: readonly string[]; note: readonly string[]; turn: number };

const SOURCES: readonly Source[] = [
  { title: ['Spice cards'], note: ['a static SVG map and', 'a list of highlights'], turn: 0 },
  { title: ['Rulebook', 'illustrations'], note: ['own geometry file:', '1,324 lines of JSON'], turn: 28 },
  { title: ['Game table'], note: ['its own board mesh'], turn: -17 },
  { title: ['Homepage, glossary', 'and tutorial'], note: ['the built-in copies'], turn: 44 },
];

const READERS = ['Spice cards', 'Rulebooks', 'Game tables', 'Homepage', 'Glossary', 'Tutorial'] as const;

/** How long each side shows while the figure plays on its own; the "after" side carries the point, so it stays longer. */
const BEFORE_MS = 3600;
const AFTER_MS = 6000;

/** Where everything sits, for the wide drawing and the narrow one a phone shows instead. */
type Layout = {
  width: number;
  height: number;
  card: { width: number; height: number; board: Point; boardRadius: number; text: Point; anchor: 'start' | 'middle' };
  cards: readonly Point[];
  hub: Point;
  hubRadius: number;
  /* A chip's box, where its small board sits from the left edge, and where its words start. */
  chip: { width: number; height: number; icon: number; text: number };
  chips: readonly Point[];
};

const WIDE: Layout = {
  width: 480,
  height: 320,
  card: {
    width: 228,
    height: 128,
    board: { x: 42, y: 64 },
    boardRadius: 32,
    text: { x: 84, y: 64 },
    anchor: 'start',
  },
  cards: [
    { x: 12, y: 16 },
    { x: 240, y: 16 },
    { x: 12, y: 176 },
    { x: 240, y: 176 },
  ],
  hub: { x: 240, y: 150 },
  hubRadius: 58,
  chip: { width: 116, height: 40, icon: 18, text: 36 },
  chips: [
    { x: 74, y: 52 },
    { x: 74, y: 150 },
    { x: 74, y: 248 },
    { x: 406, y: 52 },
    { x: 406, y: 150 },
    { x: 406, y: 248 },
  ],
};

const NARROW: Layout = {
  width: 320,
  height: 380,
  card: {
    width: 148,
    height: 175,
    board: { x: 74, y: 50 },
    boardRadius: 34,
    text: { x: 74, y: 112 },
    anchor: 'middle',
  },
  cards: [
    { x: 8, y: 10 },
    { x: 164, y: 10 },
    { x: 8, y: 195 },
    { x: 164, y: 195 },
  ],
  hub: { x: 160, y: 190 },
  hubRadius: 42,
  chip: { width: 104, height: 34, icon: 14, text: 27 },
  chips: [
    { x: 58, y: 70 },
    { x: 58, y: 190 },
    { x: 58, y: 310 },
    { x: 262, y: 70 },
    { x: 262, y: 190 },
    { x: 262, y: 310 },
  ],
};

/** A small circular board: the rim, three shared dividing lines, a rock wedge, a stronghold and the polar sink, turned by `turn` degrees so one copy differs a little from the next. */
function MiniBoard({ r, turn = 0 }: { r: number; turn?: number }) {
  const p = (x: number, y: number) => `${(x * r).toFixed(1)} ${(y * r).toFixed(1)}`;
  const lines = [
    `M${p(-0.95, -0.31)} Q${p(-0.2, 0.1)} ${p(0.8, -0.6)}`,
    `M${p(-0.6, 0.8)} Q${p(0.1, 0.2)} ${p(0.95, 0.31)}`,
    `M${p(-0.31, -0.95)} Q${p(-0.1, -0.2)} ${p(0.31, 0.95)}`,
  ].join(' ');
  const rock = `M${p(-0.6, 0.8)} Q${p(0.1, 0.2)} ${p(0.95, 0.31)} A${r} ${r} 0 0 1 ${p(-0.6, 0.8)} Z`;
  return (
    <g transform={`rotate(${turn})`}>
      <circle r={r} className={styles.sand} />
      <path d={rock} className={styles.rock} />
      <path d={lines} className={styles.divider} />
      <circle cx={0.5 * r} cy={-0.18 * r} r={0.13 * r} className={styles.stronghold} />
      <circle r={0.17 * r} className={styles.polar} />
      <circle r={r} className={styles.rim} />
    </g>
  );
}

/** One of the four places, as it was: a frame with its copy of the board and a note on what that copy was made of. */
function SourceCard({ layout, index, after }: { layout: Layout; index: number; after: boolean }) {
  const { card } = layout;
  const at = layout.cards[index]!;
  const source = SOURCES[index]!;
  const lines: { text: string; title?: boolean }[] = [
    ...source.title.map((text) => ({ text, title: true })),
    ...source.note.map((text) => ({ text })),
  ];
  const block = source.title.length * 15 + source.note.length * 13;
  const start = card.anchor === 'start' ? card.text.y - block / 2 + 11 : card.text.y - 2;
  let y = start;
  return (
    <>
      <g
        className={clsx(styles.frame, after && styles.frameGone)}
        style={{ '--x': at.x, '--y': at.y } as CSSProperties}
      >
        <rect width={card.width} height={card.height} rx="8" className={styles.frameBox} />
        <text x={card.text.x} textAnchor={card.anchor}>
          {lines.map((line) => {
            const node = (
              <tspan key={line.text} x={card.text.x} y={y} className={line.title ? styles.title : styles.note}>
                {line.text}
              </tspan>
            );
            y += line.title ? 15 : 13;
            return node;
          })}
        </text>
      </g>
      {/* The copy travels to the middle when the board becomes one, so it sits outside the frame that fades in place. */}
      <g
        className={clsx(styles.copy, after && styles.copyMerged)}
        style={
          {
            '--x': at.x + card.board.x,
            '--y': at.y + card.board.y,
            '--hx': layout.hub.x,
            '--hy': layout.hub.y,
          } as CSSProperties
        }
      >
        <MiniBoard r={card.boardRadius} turn={source.turn} />
      </g>
    </>
  );
}

/** Where a saved board reaches: one chip per reader, slid out from the middle along its line. */
function ReaderChip({ layout, index, after }: { layout: Layout; index: number; after: boolean }) {
  const at = layout.chips[index]!;
  const { chip } = layout;
  return (
    <g
      className={clsx(styles.chip, !after && styles.chipHome)}
      style={{ '--x': at.x, '--y': at.y, '--hx': layout.hub.x, '--hy': layout.hub.y } as CSSProperties}
    >
      <rect
        x={-chip.width / 2}
        y={-chip.height / 2}
        width={chip.width}
        height={chip.height}
        rx="6"
        className={styles.chipBox}
      />
      <g transform={`translate(${-chip.width / 2 + chip.icon} 0)`}>
        <MiniBoard r={chip.icon - 6} />
      </g>
      <text x={-chip.width / 2 + chip.text} y="4" className={styles.chipLabel}>
        {READERS[index]}
      </text>
    </g>
  );
}

function Scene({ layout, view, narrow }: { layout: Layout; view: View; narrow: boolean }) {
  const after = view === 'after';
  const { hub, hubRadius } = layout;
  return (
    <svg
      className={clsx(styles.scene, narrow ? styles.narrow : styles.wide)}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={
        after
          ? 'One saved board, Arrakis Official, read by Spice cards, rulebooks, game tables, the homepage, the glossary and the tutorial'
          : 'Four places, each with its own copy of Arrakis: Spice cards, rulebook illustrations, the game table, and the homepage, glossary and tutorial'
      }
    >
      {/* The lines from the saved board to its readers, drawn first so the chips cover their ends. */}
      <g className={clsx(styles.links, !after && styles.linksHidden)}>
        {layout.chips.map((chip, index) => (
          <line key={index} x1={hub.x} y1={hub.y} x2={chip.x} y2={chip.y} className={styles.link} />
        ))}
      </g>

      {SOURCES.map((source, index) => (
        <SourceCard key={source.title[0]} layout={layout} index={index} after={after} />
      ))}

      <g
        className={clsx(styles.hub, !after && styles.hubHidden)}
        style={{ '--x': hub.x, '--y': hub.y } as CSSProperties}
      >
        <circle r={hubRadius + 7} className={styles.halo} />
        <MiniBoard r={hubRadius} />
        <text y={hubRadius + 20} className={styles.hubTitle}>
          Arrakis Official
        </text>
        <text y={hubRadius + 33} className={styles.hubNote}>
          one saved board · 42 territories
        </text>
      </g>

      {READERS.map((reader, index) => (
        <ReaderChip key={reader} layout={layout} index={index} after={after} />
      ))}
    </svg>
  );
}

export function ArrakisCopies() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('before');
  /* Once the reader picks a side the figure stops changing it under them. */
  const [manual, setManual] = useState(false);
  const { armed, active } = useInView(rootRef);
  const reduced = useReducedMotion();
  const playing = armed && active && !reduced && !manual;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setTimeout(
      () => setView((current) => (current === 'before' ? 'after' : 'before')),
      view === 'before' ? BEFORE_MS : AFTER_MS
    );
    return () => clearTimeout(timer);
  }, [playing, view]);

  const pick = (next: View) => {
    setManual(true);
    setView(next);
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.controls} role="group" aria-label="Before or after">
        {(['before', 'after'] as const).map((option) => (
          <UnstyledButton
            key={option}
            className={clsx(styles.tab, option === view && styles.tabOn)}
            aria-pressed={option === view}
            onClick={() => pick(option)}
          >
            {option === 'before' ? 'Before' : 'After'}
          </UnstyledButton>
        ))}
      </div>
      <div className={styles.stage}>
        <Scene layout={WIDE} view={view} narrow={false} />
        <Scene layout={NARROW} view={view} narrow />
      </div>
      <p className={styles.legend}>
        <span className={clsx(styles.line, view === 'before' && styles.lit)}>Four places, four copies of Arrakis.</span>
        <span className={clsx(styles.line, view === 'after' && styles.lit)}>
          One saved board. Save it, and every page that reads it follows.
        </span>
      </p>
    </div>
  );
}
