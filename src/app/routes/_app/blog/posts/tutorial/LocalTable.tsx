import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useState } from 'react';
import type { ReactNode } from 'react';

import styles from './LocalTable.module.css';

/*
 * The figure for where the table runs: the same table code in a room on Cloudflare for a real game, and in the reader's own tab for the tutorial.
 * One drawing holds both states, and a switch moves its parts between them: the table code and its storage slide out of the cloud and into the tab, the other players' browsers give way to practice-player chips, and the cloud fades to a crossed-out ghost.
 * Every part keeps its base position in an SVG `transform` attribute, and the stylesheet moves an inner group with a CSS transform, so the two never fight.
 */

const WIDTH = 480;
const HEIGHT = 280;

type Mode = 'game' | 'tutorial';

const MODES: readonly { mode: Mode; label: string }[] = [
  { mode: 'game', label: 'A real game' },
  { mode: 'tutorial', label: 'The tutorial' },
];

const BROWSER = { width: 112, height: 64 };
const TAB = { x: 56, y: 12, width: 368, height: 212 };
const BLOCK = { width: 100, height: 60 };
const CHIP = { width: 108, height: 24 };

/** The three screens of a real game, by their top-left corner, with the reader's own first. */
const BROWSERS = [
  { x: 16, name: 'You', label: 'your browser' },
  { x: 184, name: 'Player 2', label: 'their browser' },
  { x: 352, name: 'Player 3', label: 'their browser' },
] as const;

/** Where each browser's line reaches the cloud, spread a little so the three lines do not meet in one point. */
const CLOUD_PORTS = [190, 240, 290] as const;
const CLOUD = { x: 118, y: 138, width: 244, height: 126 };
const CHIPS_X = [68, 178, 288] as const;
const CHIPS_Y = 154;
/** The table code block in each state, with the chips' lines ending at its bottom edge in the tutorial. */
const CODE_IN_GAME = { x: 130, y: 176 };
const CODE_IN_TAB = { x: 110, y: 60 };
const STORAGE_IN_GAME = { x: 250, y: 176 };

const ALT: Record<Mode, string> = {
  game: 'Three browsers, yours and two other players, each with a line to one room on Cloudflare that holds the table code and its SQLite storage',
  tutorial:
    'One browser tab holding the table code, in-memory storage and three practice players, with the cloud crossed out beneath it',
};

const FOOTER: Record<Mode, string> = {
  game: 'Moves go to the room. It checks and saves them, and sends each seat its own view.',
  tutorial: 'Nothing leaves your browser: no server, no account, no database.',
};

/** A browser frame: a bar with three dots, a name and a word under it. */
function Screen({
  x,
  y,
  width,
  height,
  name,
  label,
  className,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  label?: string;
  className?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className}>
        <rect width={width} height={height} rx="6" className={styles.frame} />
        <rect width={width} height="14" rx="6" className={styles.bar} />
        <rect y="8" width={width} height="6" className={styles.bar} />
        <circle cx="8" cy="7" r="2.2" className={styles.dot} />
        <circle cx="15" cy="7" r="2.2" className={styles.dot} />
        <circle cx="22" cy="7" r="2.2" className={styles.dot} />
        <text x={width / 2} y="33" className={styles.name}>
          {name}
        </text>
        {label ? (
          <text x={width / 2} y="50" className={styles.tiny}>
            {label}
          </text>
        ) : null}
      </g>
    </g>
  );
}

/** A block inside the room or the tab, with a glyph above its words. */
function Block({ x, y, className, children }: { x: number; y: number; className: string; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className}>
        <rect width={BLOCK.width} height={BLOCK.height} rx="5" className={styles.block} />
        {children}
      </g>
    </g>
  );
}

/** Three lines of code, as the table's own program. */
function CodeGlyph() {
  return (
    <g className={styles.glyph} transform={`translate(${BLOCK.width / 2} 12)`}>
      <path d="M -14 0 H 6" />
      <path d="M -8 7 H 12" />
      <path d="M -8 14 H 2" />
    </g>
  );
}

/** The database cylinder, as the figures before this one drew it. */
function DatabaseGlyph() {
  return (
    <g className={styles.glyph} transform={`translate(${BLOCK.width / 2} 20)`}>
      <path d="M -13 -9 V 8 A 13 4.5 0 0 0 13 8 V -9" />
      <ellipse cx="0" cy="-9" rx="13" ry="4.5" />
      <path d="M -13 0 A 13 4.5 0 0 0 13 0" className={styles.thin} />
    </g>
  );
}

/** Rows of empty slots, as storage the page holds only in memory. */
function MemoryGlyph() {
  return (
    <g className={styles.glyph} transform={`translate(${BLOCK.width / 2} 12)`}>
      <rect x="-14" y="0" width="28" height="16" rx="2" />
      <path d="M -7 0 V 16 M 0 0 V 16 M 7 0 V 16" className={styles.thin} />
      <path d="M -14 8 H 14" className={styles.thin} />
    </g>
  );
}

function Scene() {
  const codeBottom = { x: CODE_IN_TAB.x + BLOCK.width / 2, y: CODE_IN_TAB.y + BLOCK.height };
  return (
    <svg className={styles.scene} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {/* The lines of a real game, drawn first so the boxes cover their ends. */}
      {BROWSERS.map((browser, index) => (
        <line
          key={browser.name}
          x1={browser.x + BROWSER.width / 2}
          y1={BROWSER.height + 12}
          x2={CLOUD_PORTS[index]}
          y2={CLOUD.y}
          className={clsx(styles.link, styles.gameOnly)}
        />
      ))}

      {/* The room, which slips away under the tab and comes back as a ghost. */}
      <g className={clsx(styles.cloud, styles.gameOnly)}>
        <rect x={CLOUD.x} y={CLOUD.y} width={CLOUD.width} height={CLOUD.height} rx="10" className={styles.room} />
        <text x={CLOUD.x + CLOUD.width / 2} y={CLOUD.y + 22} className={styles.title}>
          Room on Cloudflare
        </text>
      </g>
      <g className={clsx(styles.ghost, styles.tutorialOnly)}>
        <rect x="180" y="236" width="120" height="32" rx="8" className={styles.ghostBox} />
        <text x="240" y="256" className={styles.ghostLabel}>
          Cloud server
        </text>
        <line x1="186" y1="240" x2="294" y2="264" className={styles.strike} />
      </g>

      {/* The tab of the tutorial, which the real game's screens give way to. */}
      <Screen
        x={TAB.x}
        y={TAB.y}
        width={TAB.width}
        height={TAB.height}
        name="Your tab"
        className={clsx(styles.tab, styles.tutorialOnly)}
      />
      {BROWSERS.map((browser, index) => (
        <Screen
          key={browser.name}
          x={browser.x}
          y={12}
          width={BROWSER.width}
          height={BROWSER.height}
          name={browser.name}
          label={browser.label}
          className={clsx(styles.gameOnly, index === 0 ? styles.you : styles.other)}
        />
      ))}

      {/* The chips' lines into the table code, drawn over the tab's frame. */}
      {CHIPS_X.map((x) => (
        <line
          key={x}
          x1={x + CHIP.width / 2}
          y1={CHIPS_Y}
          x2={codeBottom.x}
          y2={codeBottom.y}
          className={clsx(styles.link, styles.tutorialOnly)}
        />
      ))}

      {/* The chips of the practice players, in the tab only. */}
      {CHIPS_X.map((x) => (
        <g key={x} transform={`translate(${x} ${CHIPS_Y})`}>
          <g className={clsx(styles.chip, styles.tutorialOnly)}>
            <rect width={CHIP.width} height={CHIP.height} rx="12" className={styles.chipBox} />
            <text x={CHIP.width / 2} y={CHIP.height / 2 + 3.5} className={styles.chipLabel}>
              Practice player
            </text>
          </g>
        </g>
      ))}
      <text x={WIDTH / 2} y="202" className={clsx(styles.tiny, styles.tutorialOnly, styles.chipNote)}>
        moved by the chapter, through the same table
      </text>

      {/* The connector between the table code and its storage, one for each state. */}
      <line x1="230" y1="206" x2="250" y2="206" className={clsx(styles.link, styles.gameOnly)} />
      <line x1="210" y1="90" x2="260" y2="90" className={clsx(styles.link, styles.tutorialOnly)} />

      {/* The two blocks that travel between the room and the tab. */}
      <Block x={CODE_IN_GAME.x} y={CODE_IN_GAME.y} className={styles.code}>
        <CodeGlyph />
        <text x={BLOCK.width / 2} y="47" className={styles.label}>
          Table code
        </text>
      </Block>
      <Block x={STORAGE_IN_GAME.x} y={STORAGE_IN_GAME.y} className={styles.storage}>
        <g className={styles.gameOnly}>
          <DatabaseGlyph />
          <text x={BLOCK.width / 2} y="47" className={styles.label}>
            SQLite
          </text>
        </g>
        <g className={styles.tutorialOnly}>
          <MemoryGlyph />
          <text x={BLOCK.width / 2} y="42" className={styles.label}>
            In-memory
          </text>
          <text x={BLOCK.width / 2} y="54" className={styles.label}>
            storage
          </text>
        </g>
      </Block>
    </svg>
  );
}

export function LocalTable() {
  const [mode, setMode] = useState<Mode>('game');

  return (
    <div className={clsx(styles.root, mode === 'tutorial' && styles.tutorial)}>
      <div className={styles.tabs} role="group" aria-label="Where the table runs">
        {MODES.map((option) => (
          <UnstyledButton
            key={option.mode}
            className={clsx(styles.switch, option.mode === mode && styles.switchOn)}
            aria-pressed={option.mode === mode}
            onClick={() => setMode(option.mode)}
          >
            {option.label}
          </UnstyledButton>
        ))}
      </div>
      <div className={styles.stage} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} role="img" aria-label={ALT[mode]}>
        <Scene />
      </div>
      <p className={styles.footer}>{FOOTER[mode]}</p>
    </div>
  );
}
