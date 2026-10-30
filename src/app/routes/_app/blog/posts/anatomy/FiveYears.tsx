import clsx from 'clsx';
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import styles from './FiveYears.module.css';
import { HOUSE_ATREIDES as FACTION } from './houseAtreides';
import { useSeen } from './useSeen';

/*
 * The figure for how the faction's shape changed: one ledger row per project, each with a small plan of what a faction was and a tally of how many copies of the logo there are to keep in step.
 * It is a ledger rather than another diagram with lines, so it reads differently from the main figure.
 * The asset outlines are the same seven pieces the main figure draws, in the same order.
 */

type Shape = 'page' | 'disc' | 'card' | 'small' | 'wide';

/** The seven pieces in the main figure's order: sheet, leader tokens, traitor cards, troop token, faction token, alliance card, shield. */
const PIECES: readonly Shape[] = ['page', 'disc', 'card', 'small', 'disc', 'card', 'wide'];

type Era = {
  year: string;
  project: string;
  plan: 'names' | 'apart' | 'pictures' | 'one';
  note: string;
  logos: number | null;
  tally: string;
};

/* The facts per era come from the projects' own source and history, as the previous post tells them. */
const ERAS: readonly Era[] = [
  {
    year: '2021',
    project: 'dune.games',
    plan: 'names',
    note: 'A faction is a name on a game result.',
    logos: null,
    tally: 'just a name',
  },
  {
    year: '2023',
    project: 'dune-app',
    plan: 'apart',
    note: 'A faction exists, but every card and token keeps its own copy of it.',
    logos: PIECES.length,
    tally: 'copies of the logo',
  },
  {
    year: '2024',
    project: 'dune-assets',
    plan: 'pictures',
    note: 'The pictures come first, each with its own logo, colours and background.',
    logos: PIECES.length,
    tally: 'copies of the logo',
  },
  {
    year: '2026',
    project: 'dune.zone',
    plan: 'one',
    note: 'One faction, and every piece is drawn from it.',
    logos: 1,
    tally: 'copy of the logo',
  },
];

/** The 2021 dashboard knew factions only as names in a fixed list. */
const NAMES = ['ATREIDES', 'HARKONNEN', 'FREMEN', 'EMPEROR', 'GUILD', 'BG'] as const;

function Logo({ className }: { className?: string }) {
  const mask = `url(${FACTION.logo})`;
  return <span className={clsx(styles.logo, className)} style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}

/** One asset outline; `logo` puts a copy of the logo in it, `filled` paints it as a finished picture. */
function Piece({ shape, logo, filled, ghost }: { shape: Shape; logo?: boolean; filled?: boolean; ghost?: boolean }) {
  return (
    <span className={clsx(styles.piece, styles[shape], filled && styles.filled, ghost && styles.ghost)}>
      {logo ? <Logo className={ghost ? styles.ghostLogo : undefined} /> : null}
    </span>
  );
}

function Plan({ plan }: { plan: Era['plan'] }) {
  switch (plan) {
    case 'names':
      return (
        <span className={styles.plan}>
          <span className={styles.result}>
            {NAMES.map((name) => (
              <span key={name} className={clsx(styles.nameChip, name === 'ATREIDES' && styles.picked)}>
                {name}
              </span>
            ))}
          </span>
        </span>
      );
    case 'apart':
      return (
        <span className={styles.plan}>
          <span className={styles.record}>
            <span className={styles.recordName}>{FACTION.name}</span>
          </span>
          <span className={styles.pieces}>
            {PIECES.map((shape, index) => (
              <Piece key={index} shape={shape} logo />
            ))}
          </span>
        </span>
      );
    case 'pictures':
      return (
        <span className={styles.plan}>
          <span className={styles.pieces}>
            {PIECES.map((shape, index) => (
              <Piece key={index} shape={shape} logo filled />
            ))}
          </span>
        </span>
      );
    case 'one':
      return (
        <span className={styles.plan}>
          <span className={clsx(styles.record, styles.holds)}>
            <Logo />
            <span className={styles.pieces}>
              {PIECES.map((shape, index) => (
                <Piece key={index} shape={shape} logo ghost />
              ))}
            </span>
          </span>
        </span>
      );
  }
}

export function FiveYears() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { armed, seen } = useSeen(rootRef);

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, armed && !seen && styles.waiting)}
      role="group"
      aria-label={`What ${FACTION.name} was in each project, from 2021 to 2026`}
    >
      <p className={styles.title}>{FACTION.name}, four times</p>
      <ol className={styles.ledger}>
        {ERAS.map((era, index) => (
          <li key={era.year} className={styles.row} style={{ '--row': index } as CSSProperties}>
            <span className={styles.when}>
              <span className={styles.year}>{era.year}</span>
              <span className={styles.project}>{era.project}</span>
            </span>
            <span className={styles.what}>
              <Plan plan={era.plan} />
              <span className={styles.note}>{era.note}</span>
            </span>
            <span className={styles.tally}>
              <span className={styles.count}>{era.logos ?? '–'}</span>
              <span className={styles.tallyLabel}>{era.tally}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
