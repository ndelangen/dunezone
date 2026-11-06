import { Kbd } from '@ui/content/Kbd';
import { useState } from 'react';

import styles from './KeyboardMapShortcuts.module.css';
import { Keys, PressFlash } from './Keys';
import { GROUPS, SITUATIONS, entriesForCap } from './shortcutCatalogue';
import type { ShortcutGroupId } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

/* The keyboard, as far as the table uses it; a number is how many key widths a wide key takes. */
const ROWS: readonly (readonly (string | readonly [string, number])[])[] = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  [['Tab', 1.5], 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'],
  [['', 1.8], 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  [['Shift', 2.3], 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '?'],
  [['Ctrl', 1.5], ['Alt', 1.5], ['Space', 6], '←', '↑', '→', '↓'],
];

const SITUATION_LABEL = Object.fromEntries(SITUATIONS.map((situation) => [situation.id, situation.label]));

/**
 * Variant A, the keyboard map: the keys drawn where they sit, each lit in its group's colour with what it does under it.
 * Pointing at a key, or pressing it, says everything that key does;
 * the legend lights one group's keys at a time.
 * Remembering where a key is comes from seeing it in place.
 */
export function KeyboardMapShortcuts() {
  const [focus, setFocus] = useState<string | null>(null);
  const [group, setGroup] = useState<ShortcutGroupId | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const shown = focus ? entriesForCap(focus) : [];

  return (
    <div className={styles.root}>
      <div className={styles.legend} role="group" aria-label="Light one group">
        {GROUPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={styles.chip}
            data-group={entry.id}
            aria-pressed={group === entry.id}
            onMouseEnter={() => setGroup(entry.id)}
            onMouseLeave={() => setGroup(null)}
            onFocus={() => setGroup(entry.id)}
            onBlur={() => setGroup(null)}
          >
            {entry.short}
          </button>
        ))}
      </div>

      <div className={styles.keyboard} data-dim={group ?? undefined} onMouseLeave={() => setFocus(null)}>
        {ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className={styles.row}>
            {row.map((cell, cellIndex) => {
              const [key, width] = typeof cell === 'string' ? [cell, 1] : cell;
              const entries = key ? entriesForCap(key) : [];
              const groups = [...new Set(entries.map((entry) => entry.group))];
              return (
                <button
                  key={`${key}:${cellIndex}`}
                  type="button"
                  className={styles.key}
                  style={{ flexGrow: width }}
                  data-group={groups[0]}
                  data-bound={entries.length > 0 || undefined}
                  data-both={groups.length > 1 || undefined}
                  data-lit={(group !== null && groups.includes(group)) || undefined}
                  data-focus={focus === key || undefined}
                  disabled={entries.length === 0}
                  aria-label={
                    entries.length ? `${key}: ${entries.map((entry) => entry.action).join(', ')}` : key || 'Caps'
                  }
                  onMouseEnter={() => setFocus(key)}
                  onFocus={() => setFocus(key)}
                >
                  {key && (
                    <PressFlash pressed={pressed} keyName={key}>
                      <Kbd>{key}</Kbd>
                    </PressFlash>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.detail} aria-live="polite">
        {shown.length === 0 ? (
          <p className={styles.hint}>
            Point at a key, or press one, to see everything it does. Scroll zooms; right-click opens a piece’s menu.
          </p>
        ) : (
          <ul className={styles.meanings}>
            {shown.map((entry) => (
              <li key={entry.id} className={styles.meaning} data-group={entry.group}>
                <Keys entry={entry} />
                <span className={styles.action}>{entry.action}</span>
                <span className={styles.when}>{SITUATION_LABEL[entry.when]}</span>
                {entry.detail && <span className={styles.more}>{entry.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
