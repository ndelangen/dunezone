import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import styles from './CheckpointTimeline.module.css';

/*
 * The figure for what a recall can look back at: every checkpoint of a sample four-turn game, one row per turn, and the window a recall may pick from.
 * The room keeps a checkpoint only at a boundary, never per move: the table entering a phase or setup step, a settled battle, a faction finishing its Shipment and Movement, and a declared or continued result.
 * During the game a recall offers the 30 newest of them and needs a majority of the seated players; once the game is finished it offers all of them and any seated player starts one alone.
 * The counts are the table's own (`REVIEW_CHECKPOINTS` and `reviewThreshold` in `src/shared/play/review.ts`), copied rather than imported so the figure stays a plain picture.
 */

type Moment = 'entered' | 'battle' | 'turn' | 'result';

type Checkpoint = {
  moment: Moment;
  /* The row the checkpoint sits in: a turn number, or null for setup. */
  turn: number | null;
  /* Where it is, as the log names it: "Turn 3, Shipment and Movement, after Fremen". */
  label: string;
};

type Mode = 'during' | 'after';

const PHASES = [
  'Storm',
  'Spice Blow',
  'CHOAM Charity',
  'Bidding',
  'Revival',
  'Shipment and Movement',
  'Battle',
  'Spice Collection',
  'Mentat Pause',
] as const;

const SETUP_STEPS = ['Prediction', 'Traitors', 'Starting troops'] as const;

/** Five seats in storm order; the order turns one seat each turn as the storm moves on. */
const FACTIONS = ['Atreides', 'Harkonnen', 'Emperor', 'Fremen', 'Guild'] as const;

/** How many battles each turn's Battle phase settled. */
const BATTLES = [0, 1, 2, 1] as const;

const TURNS = BATTLES.length;

/** How many of the newest checkpoints a recall offers during a game. */
const OFFERED_DURING = 30;

const SEATED = FACTIONS.length;
/** A majority of the seated players, the proposer included. */
const MAJORITY = Math.floor(SEATED / 2) + 1;

const ORDINALS = ['first', 'second', 'third'] as const;

function sampleGame(): readonly Checkpoint[] {
  const checkpoints: Checkpoint[] = SETUP_STEPS.map((step) => ({
    moment: 'entered',
    turn: null,
    label: `Setup, ${step}`,
  }));
  for (let turn = 1; turn <= TURNS; turn += 1) {
    for (const phase of PHASES) {
      checkpoints.push({ moment: 'entered', turn, label: `Turn ${turn}, ${phase}` });
      if (phase === 'Shipment and Movement') {
        for (let seat = 0; seat < FACTIONS.length; seat += 1) {
          const faction = FACTIONS[(seat + turn - 1) % FACTIONS.length];
          checkpoints.push({ moment: 'turn', turn, label: `Turn ${turn}, ${phase}, after ${faction}` });
        }
      }
      if (phase === 'Battle') {
        for (let battle = 0; battle < BATTLES[turn - 1]!; battle += 1) {
          checkpoints.push({
            moment: 'battle',
            turn,
            label: `Turn ${turn}, Battle, ${ORDINALS[battle]} battle settled`,
          });
        }
      }
    }
  }
  checkpoints.push({ moment: 'result', turn: TURNS, label: `Turn ${TURNS}, Mentat Pause, result declared` });
  return checkpoints;
}

const CHECKPOINTS = sampleGame();

/** Every row of the figure in order: setup first, then each turn. */
const ROWS: readonly { turn: number | null; title: string }[] = [
  { turn: null, title: 'Setup' },
  ...Array.from({ length: TURNS }, (_, index) => ({ turn: index + 1, title: `Turn ${index + 1}` })),
];

const MOMENTS: Record<Moment, { className: string; name: string }> = {
  entered: { className: styles.entered, name: 'Phase or setup step entered' },
  turn: { className: styles.turn, name: 'Faction finished Shipment and Movement' },
  battle: { className: styles.battle, name: 'Battle settled' },
  result: { className: styles.result, name: 'Result declared' },
};

const MODES: readonly { mode: Mode; name: string }[] = [
  { mode: 'during', name: 'During the game' },
  { mode: 'after', name: 'After the game' },
];

/** The first checkpoint a recall may offer in each mode. */
function offeredFrom(mode: Mode): number {
  return mode === 'during' ? Math.max(0, CHECKPOINTS.length - OFFERED_DURING) : 0;
}

/** Where the arrow keys take the focus along the strip; Home and End jump to its ends. */
function nextIndex(key: string, current: number): number | undefined {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return Math.min(CHECKPOINTS.length - 1, current + 1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return Math.max(0, current - 1);
    case 'Home':
      return 0;
    case 'End':
      return CHECKPOINTS.length - 1;
    default:
      return undefined;
  }
}

function Marker({ moment, offered }: { moment: Moment; offered: boolean }) {
  return (
    <span className={clsx(styles.marker, MOMENTS[moment].className, offered && styles.offered)} aria-hidden="true" />
  );
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="What each marker records">
      {(Object.keys(MOMENTS) as Moment[]).map((moment) => (
        <li key={moment} className={styles.legendItem}>
          <Marker moment={moment} offered />
          {MOMENTS[moment].name}
        </li>
      ))}
    </ul>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className={styles.modes} role="group" aria-label="When the recall is asked for">
      {MODES.map((option) => (
        <UnstyledButton
          key={option.mode}
          className={clsx(styles.mode, option.mode === mode && styles.modeOn)}
          aria-pressed={option.mode === mode}
          onClick={() => onChange(option.mode)}
        >
          {option.name}
        </UnstyledButton>
      ))}
    </div>
  );
}

function Terms({ mode }: { mode: Mode }) {
  const from = offeredFrom(mode);
  const count = CHECKPOINTS.length - from;
  return (
    <p className={styles.terms}>
      <strong className={styles.count}>
        {count} of {CHECKPOINTS.length}
      </strong>{' '}
      checkpoints offered.{' '}
      {mode === 'during'
        ? `The ${OFFERED_DURING} most recent, and ${MAJORITY} of the ${SEATED} seated players must agree, the proposer among them.`
        : 'Every checkpoint of the game, and any seated player starts the recall alone.'}
    </p>
  );
}

/** One row of markers along a line, the setup steps or one turn, each marker a button that reads out its checkpoint. */
function Row({
  title,
  turn,
  from,
  pointed,
  chosen,
  onPoint,
  onLeave,
  onFocus,
  onKeyDown,
}: {
  title: string;
  turn: number | null;
  from: number;
  pointed: number;
  chosen: number;
  onPoint: (index: number) => void;
  onLeave: () => void;
  onFocus: (index: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.rowTitle}>{title}</span>
      <span className={styles.strip} onPointerLeave={onLeave}>
        {CHECKPOINTS.map((checkpoint, index) =>
          checkpoint.turn === turn ? (
            <UnstyledButton
              key={index}
              className={clsx(
                styles.cell,
                index >= from && styles.cellOffered,
                index === pointed && styles.cellPointed
              )}
              aria-label={checkpoint.label}
              aria-pressed={index === chosen}
              tabIndex={index === chosen ? 0 : -1}
              onPointerEnter={() => onPoint(index)}
              onFocus={() => onFocus(index)}
              onClick={() => onFocus(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <Marker moment={checkpoint.moment} offered={index >= from} />
            </UnstyledButton>
          ) : null
        )}
      </span>
    </li>
  );
}

export function CheckpointTimeline() {
  const [mode, setMode] = useState<Mode>('during');
  /* The checkpoint the reader has settled on, by focus or a press; it keeps the readout once the pointer leaves. */
  const [chosen, setChosen] = useState(CHECKPOINTS.length - 1);
  /* The checkpoint under the pointer, shown ahead of the chosen one while it is there. */
  const [hovered, setHovered] = useState<number | null>(null);

  const rowsRef = useRef<HTMLOListElement>(null);

  const from = offeredFrom(mode);
  const pointed = hovered ?? chosen;
  const checkpoint = CHECKPOINTS[pointed]!;
  const offered = pointed >= from;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const next = nextIndex(event.key, index);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    setChosen(next);
    /* The buttons sit in checkpoint order across the rows, so the next checkpoint is the next button. */
    rowsRef.current?.querySelectorAll('button')[next]?.focus();
  };

  return (
    <div
      className={styles.root}
      role="group"
      aria-label="The checkpoints of a four-turn game, and which of them a recall can show"
    >
      <ModeSwitch mode={mode} onChange={setMode} />
      <Terms mode={mode} />

      <ol ref={rowsRef} className={styles.rows}>
        {ROWS.map((row) => (
          <Row
            key={row.title}
            title={row.title}
            turn={row.turn}
            from={from}
            pointed={pointed}
            chosen={chosen}
            onPoint={setHovered}
            onLeave={() => setHovered(null)}
            onFocus={setChosen}
            onKeyDown={onKeyDown}
          />
        ))}
      </ol>

      {/* The buttons carry their own names, so the readout is a picture of the one pointed at, not a second announcement. */}
      <p className={clsx(styles.readout, offered && styles.readoutOffered)} aria-hidden="true">
        <Marker moment={checkpoint.moment} offered={offered} />
        <span className={styles.readoutLabel}>{checkpoint.label}</span>
        <span className={styles.readoutState}>{offered ? 'offered' : 'not offered'}</span>
      </p>

      <Legend />
    </div>
  );
}
