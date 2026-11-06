import { Progress } from '@mantine/core';
import { Check } from 'lucide-react';
import { useState } from 'react';

import { Keys } from './Keys';
import { SHORTCUT_ENTRIES, capsOf } from './shortcutCatalogue';
import styles from './TriedShortcuts.module.css';
import { usePressedKey } from './usePressedKey';

/* The order a new player is nudged through: windows first, then pieces, then the finer view keys. */
const NUDGE_ORDER = ['windows', 'pieces', 'bidding', 'view'];
const SUGGESTED = 3;

/**
 * Variant H, learn as you play: the sheet remembers which keys the player has used.
 * The next three to try sit on top, the rest not yet tried below, and the keys already theirs fold to a quiet list with how often they were used.
 * A key used while the sheet is open ticks over to "yours" on the spot.
 */
export function TriedShortcuts({ used: initial = {} }: Readonly<{ used?: Readonly<Record<string, number>> }>) {
  const [used, setUsed] = useState<Record<string, number>>({ ...initial });
  const [fresh, setFresh] = useState<string | null>(null);
  usePressedKey((key) => {
    const hit = SHORTCUT_ENTRIES.filter((entry) => !entry.pointer && capsOf(entry).includes(key));
    setUsed((last) => {
      const next = { ...last };
      for (const entry of hit) {
        next[entry.id] = (next[entry.id] ?? 0) + 1;
      }
      return next;
    });
    setFresh(hit[0]?.id ?? null);
  });

  const untried = SHORTCUT_ENTRIES.filter((entry) => !used[entry.id]).toSorted(
    (a, b) => NUDGE_ORDER.indexOf(a.group) - NUDGE_ORDER.indexOf(b.group)
  );
  const next = untried.slice(0, SUGGESTED);
  const later = untried.slice(SUGGESTED);
  const known = SHORTCUT_ENTRIES.filter((entry) => used[entry.id]).toSorted((a, b) => used[b.id]! - used[a.id]!);
  const share = known.length / SHORTCUT_ENTRIES.length;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <p className={styles.summary}>
          You use <strong>{known.length}</strong> of the table’s {SHORTCUT_ENTRIES.length} keys.
          {next.length > 0 ? ' Try one of these next.' : ' You know them all.'}
        </p>
        <Progress color="var(--color-positive)" value={share * 100} size="sm" className={styles.bar} aria-label="Keys you use" />
      </div>

      {next.length > 0 && (
        <ul className={styles.next}>
          {next.map((entry, index) => (
            <li
              key={entry.id}
              className={styles.suggestion}
              data-group={entry.group}
              style={{ animationDelay: `${index * 0.6}s` }}
            >
              <span className={styles.big}>
                <Keys entry={entry} />
              </span>
              <span className={styles.action}>{entry.action}</span>
              {(entry.detail ?? entry.hook) && <span className={styles.hint}>{entry.detail ?? entry.hook}</span>}
            </li>
          ))}
        </ul>
      )}

      {later.length > 0 && (
        <section aria-label="Not tried yet">
          <h3 className={styles.heading}>Not tried yet</h3>
          <ul className={styles.list}>
            {later.map((entry) => (
              <li key={entry.id} data-group={entry.group}>
                <Keys entry={entry} /> <span>{entry.action}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {known.length > 0 && (
        <section aria-label="Already yours">
          <h3 className={styles.heading}>Already yours</h3>
          <ul className={styles.list} data-known>
            {known.map((entry) => (
              <li key={entry.id} data-group={entry.group} data-fresh={fresh === entry.id || undefined}>
                <Check size={12} aria-hidden className={styles.tick} />
                <Keys entry={entry} /> <span>{entry.action}</span>
                <span className={styles.count}>×{used[entry.id]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
