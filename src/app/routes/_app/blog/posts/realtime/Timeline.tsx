import clsx from 'clsx';
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import styles from './Timeline.module.css';
import { useSeen } from './useSeen';

/*
 * The figure for how the table got here: one line down the page with a mark per step, from Dune Play's own repository to the room that sleeps between moves.
 * The dates and words come from the table's own history, as the post tells it; the entries fade in in turn once the reader reaches them.
 */

type Entry = { when: string; text: string };

const ENTRIES: readonly Entry[] = [
  {
    when: 'Before Sept 2026',
    text: 'Dune Play is its own project. Early plans keep the table in the site’s database; its design record then picks one Durable Object per game.',
  },
  {
    when: '8 Sept 2026',
    text: 'The table moves into dune.zone, and signed-in players share a hosted table the same day.',
  },
  { when: '13 Sept', text: 'Movement is batched and updates carry revision numbers. Private faction spice banks.' },
  {
    when: '19 Sept',
    text: 'Every drag shares one pointer session. Traffic measured; motion updates lose their unchanged snapshot, saved moves send only what moved.',
  },
  {
    when: '10 to 11 Oct',
    text: 'Public Treachery counts; flip a piece while carrying it; a private hidden zone beside your hand; reveal part of a battle plan early.',
  },
  {
    when: '17 Oct',
    text: 'Signed seat passes let the room admit players without asking the site’s database every 90 seconds.',
  },
  { when: '26 Oct', text: 'A quiet room hibernates while its players think.' },
];

export function Timeline() {
  const rootRef = useRef<HTMLOListElement>(null);
  const { armed, seen } = useSeen(rootRef);

  return (
    <ol
      ref={rootRef}
      className={clsx(styles.root, armed && !seen && styles.waiting)}
      aria-label="How the table came to be, from Dune Play to the room on dune.zone"
    >
      {ENTRIES.map((entry, index) => (
        <li
          key={entry.when}
          className={clsx(styles.entry, index === ENTRIES.length - 1 && styles.latest)}
          style={{ '--row': index } as CSSProperties}
        >
          <span className={styles.when}>{entry.when}</span>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.text}>{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}
