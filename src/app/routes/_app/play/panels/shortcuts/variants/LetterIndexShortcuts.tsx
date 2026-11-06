import { Kbd } from '@ui/content/Kbd';
import { useEffect, useRef } from 'react';

import { PressFlash } from './Keys';
import styles from './LetterIndexShortcuts.module.css';
import { SHORTCUT_ENTRIES, capsOf } from './shortcutCatalogue';
import type { Situation } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

/* The columns: what a key does anywhere, over a piece, while bidding, and the rarer moments. */
const COLUMNS: readonly Readonly<{ title: string; when: readonly Situation[] }>[] = [
  { title: 'Anywhere', when: ['table'] },
  { title: 'Over a piece', when: ['piece'] },
  { title: 'Bidding', when: ['bidding'] },
  { title: 'Carrying or at the bank', when: ['carrying', 'spice'] },
];

/* Letters first, A to Z, then digits, then the named keys in the order a hand finds them. */
const NAMED = ['Space', 'Esc', 'Tab', 'Alt', 'Ctrl', '←', '↑', '→', '↓', '[', ']', '?'];
function order(key: string) {
  if (/^[A-Z]$/.test(key)) {
    return key.charCodeAt(0);
  }
  if (/^\d$/.test(key)) {
    return 200;
  }
  return 300 + NAMED.indexOf(key);
}

/* Each key once, with the digits as one row and the arrows as another. */
function keyRows() {
  const keys = new Set<string>();
  for (const entry of SHORTCUT_ENTRIES.filter((each) => !each.pointer)) {
    for (const key of capsOf(entry)) {
      keys.add(/^\d$/.test(key) ? '1–9' : ['←', '↑', '→', '↓'].includes(key) ? '← ↑ → ↓' : key);
    }
  }
  return [...keys].sort((a, b) => order(a.split(/[–\s]/)[0]!) - order(b.split(/[–\s]/)[0]!));
}
const ROWS = keyRows();

function entriesOfRow(row: string) {
  const caps = row === '1–9' ? ['1'] : row === '← ↑ → ↓' ? ['←'] : [row];
  return SHORTCUT_ENTRIES.filter((entry) => caps.some((key) => capsOf(entry).includes(key)));
}

/* The row a pressed key lives in. */
function rowOf(key: string) {
  return /^\d$/.test(key) ? '1–9' : ['←', '↑', '→', '↓'].includes(key) ? '← ↑ → ↓' : key;
}

/**
 * Variant G, the key index: every key once, A to Z, with what it does in each situation side by side.
 * It answers "what does F do?" at a glance, and shows the keys that change meaning over a piece.
 * Pressing a key jumps to its row.
 */
export function LetterIndexShortcuts() {
  const pressed = usePressedKey();
  const table = useRef<HTMLTableElement>(null);
  useEffect(() => {
    if (pressed) {
      table.current
        ?.querySelector(`[data-row="${CSS.escape(rowOf(pressed.key))}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [pressed]);

  return (
    <table className={styles.table} ref={table}>
      <thead>
        <tr>
          <th scope="col" className={styles.keyHead}>
            Key
          </th>
          {COLUMNS.map((column) => (
            <th key={column.title} scope="col">
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => {
          const entries = entriesOfRow(row);
          const meanings = COLUMNS.filter((column) => entries.some((entry) => column.when.includes(entry.when)));
          const hit = pressed !== null && rowOf(pressed.key) === row;
          return (
            <tr key={row} data-row={row} data-hit={hit || undefined} data-two={meanings.length > 1 || undefined}>
              <th scope="row" className={styles.key}>
                <PressFlash pressed={hit ? { key: row, count: pressed.count } : null} keyName={row}>
                  {row.split(' ').map((cap) => (
                    <Kbd key={cap}>{cap}</Kbd>
                  ))}
                </PressFlash>
              </th>
              {COLUMNS.map((column) => {
                const here = entries.filter((entry) => column.when.includes(entry.when));
                return (
                  <td key={column.title}>
                    {here.map((entry) => (
                      <span key={entry.id} className={styles.cell} data-group={entry.group}>
                        {entry.press === 'hold' ? `Hold: ${entry.action}` : entry.action}
                      </span>
                    ))}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
