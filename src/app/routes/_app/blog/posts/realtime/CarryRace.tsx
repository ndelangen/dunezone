import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import styles from './CarryRace.module.css';
import { Hand } from './Hand';
import { SEATS } from './palette';
import { useSteps } from './useSteps';

/*
 * The figure for two players reaching for one troop: a sequence of messages between the Atreides browser, the room and the Harkonnen browser, with a strip of Harkonnen's screen above showing the troop on its way.
 * The messages are the table's own three: `begin` reserves a piece for one carry, `pose` says where it is while carried, and `drop` is the command the room checks and saves before it tells everyone.
 * The refusal is the exact text the second player reads.
 */

type Lane = 0 | 1 | 2;

type Step = {
  /* Arrows in this step, each from one lane to another; a note is the room talking to itself. */
  messages: readonly { from: Lane; to: Lane; text: string; kind?: 'command' | 'refused' | 'note' | 'saved' }[];
  /* Where Harkonnen sees the troop after this step, as a share of the strip's width, and whether it is in the air. */
  troop: { at: number; lifted: boolean };
};

const STEPS: readonly Step[] = [
  { messages: [{ from: 0, to: 1, text: 'begin: troop', kind: 'command' }], troop: { at: 0.12, lifted: false } },
  { messages: [{ from: 1, to: 1, text: 'reserved for Atreides', kind: 'note' }], troop: { at: 0.12, lifted: false } },
  { messages: [{ from: 1, to: 2, text: 'carrying' }], troop: { at: 0.12, lifted: true } },
  { messages: [{ from: 2, to: 1, text: 'begin: same troop', kind: 'command' }], troop: { at: 0.12, lifted: true } },
  {
    messages: [{ from: 1, to: 2, text: 'Another player is carrying that piece.', kind: 'refused' }],
    troop: { at: 0.12, lifted: true },
  },
  {
    messages: [
      { from: 0, to: 1, text: 'pose' },
      { from: 1, to: 2, text: 'pose' },
    ],
    troop: { at: 0.34, lifted: true },
  },
  {
    messages: [
      { from: 0, to: 1, text: 'pose' },
      { from: 1, to: 2, text: 'pose' },
    ],
    troop: { at: 0.56, lifted: true },
  },
  {
    messages: [
      { from: 0, to: 1, text: 'pose' },
      { from: 1, to: 2, text: 'pose' },
    ],
    troop: { at: 0.78, lifted: true },
  },
  { messages: [{ from: 0, to: 1, text: 'drop', kind: 'command' }], troop: { at: 0.78, lifted: true } },
  { messages: [{ from: 1, to: 1, text: 'checked and saved', kind: 'saved' }], troop: { at: 0.78, lifted: true } },
  {
    messages: [
      { from: 1, to: 0, text: 'update' },
      { from: 1, to: 2, text: 'update' },
    ],
    troop: { at: 0.78, lifted: false },
  },
];

const STEP_MS = 700;

function Message({ from, to, text, kind }: Step['messages'][number]) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const style = { gridColumn: from === to ? `${from + 1}` : `${start + 1} / ${end + 2}` } as CSSProperties;
  if (from === to) {
    return (
      <span className={clsx(styles.note, kind === 'saved' && styles.saved)} style={style}>
        {kind === 'saved' ? <Cylinder /> : null}
        {text}
      </span>
    );
  }
  return (
    <span
      className={clsx(
        styles.arrow,
        to < from && styles.leftward,
        kind === 'refused' && styles.refused,
        kind === 'command' && styles.command
      )}
      style={style}
    >
      <span className={styles.arrowText}>{text}</span>
    </span>
  );
}

/** The room's database, drawn small beside a saved note. */
function Cylinder() {
  return (
    <svg viewBox="0 0 16 18" className={styles.cylinder} aria-hidden="true">
      <path d="M 2 4 V 14 A 6 2.5 0 0 0 14 14 V 4" />
      <ellipse cx="8" cy="4" rx="6" ry="2.5" />
    </svg>
  );
}

export function CarryRace() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { step, finished, replay, playing } = useSteps(rootRef, STEPS.length, { interval: STEP_MS });
  const troop = STEPS[Math.max(0, step - 1)]!.troop;
  const carried = step > 0 && troop.lifted;
  /* Harkonnen's hand reaches in while its own begin is on the way and the refusal comes back. */
  const reaching = step === 4 || step === 5;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      role="group"
      aria-label="Two players reach for one troop; the room gives it to the first"
    >
      <div className={styles.strip} aria-hidden="true">
        <span className={styles.stripTitle}>Harkonnen&rsquo;s screen</span>
        <span className={styles.shadow} style={{ '--at': troop.at } as CSSProperties} />
        <span
          className={clsx(styles.troop, carried && styles.lifted)}
          style={{ '--at': troop.at, '--seat': SEATS.atreides.color } as CSSProperties}
        />
        <span
          className={clsx(styles.carrier, carried && styles.carrierShown)}
          style={{ '--at': troop.at } as CSSProperties}
        >
          <Hand seat="atreides" bare />
        </span>
        <span
          className={clsx(styles.reacher, reaching && styles.reacherShown)}
          style={{ '--at': 0.12 } as CSSProperties}
        >
          <Hand seat="harkonnen" bare />
        </span>
      </div>

      <div className={styles.lanes}>
        {(['atreides', 'room', 'harkonnen'] as const).map((lane) => (
          <span
            key={lane}
            className={styles.lane}
            style={lane === 'room' ? undefined : ({ '--seat': SEATS[lane].color } as CSSProperties)}
          >
            {lane === 'room' ? (
              'Room'
            ) : (
              <>
                {SEATS[lane].name}
                <span className={styles.laneSuffix}> browser</span>
              </>
            )}
          </span>
        ))}
      </div>

      <ol className={styles.rows}>
        {STEPS.map((entry, index) => (
          <li key={index} className={clsx(styles.row, index >= step && styles.pending)}>
            {entry.messages.map((message, messageIndex) => (
              <Message key={messageIndex} {...message} />
            ))}
          </li>
        ))}
      </ol>

      {playing ? (
        <UnstyledButton
          className={clsx(styles.replay, !finished && styles.replayHidden)}
          onClick={replay}
          disabled={!finished}
        >
          Replay
        </UnstyledButton>
      ) : null}
    </div>
  );
}
