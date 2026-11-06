import { Tooltip } from '@mantine/core';
import { Kbd } from '@ui/content/Kbd';

import styles from './KeyMap.module.css';
import { PressFlash } from './Keys';
import { SITUATION_LABEL, entriesForCap, isNow, meaningNow } from './shortcutCatalogue';
import type { Now, ShortcutEntry } from './shortcutCatalogue';
import type { Pressed } from './usePressedKey';

/* The keyboard, as far as the table uses it; a number is how many key widths a wide key takes. */
const ROWS: readonly (readonly (string | readonly [string, number])[])[] = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  [['Tab', 1.5], 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'],
  [['', 1.8], 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  [['Shift', 2.3], 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '?'],
  [['Ctrl', 1.5], ['Alt', 1.5], ['Space', 6], '←', '↑', '→', '↓'],
];

/** The word on a key, its own letter lit when the word has it: "Hand" on H, with the H lit. */
export function Caption({ entry, keyName }: Readonly<{ entry: ShortcutEntry; keyName: string }>) {
  const at = keyName.length === 1 ? entry.short.toLowerCase().indexOf(keyName.toLowerCase()) : -1;
  if (at < 0) {
    return <>{entry.short}</>;
  }
  return (
    <>
      {entry.short.slice(0, at)}
      <b className={styles.lit}>{entry.short.slice(at, at + 1)}</b>
      {entry.short.slice(at + 1)}
    </>
  );
}

export type KeyMapProps = Readonly<{
  /** What holds at the table; a key shows what it does now, and keys that do something only now glow. */
  now: readonly Now[];
  pressed: Pressed;
  /** The key pointed at or pressed last, outlined. */
  focus: string | null;
  onFocus: (key: string | null) => void;
  /** Each key carries its word, such as Hand or Flip. */
  captions?: boolean;
  /** Whether keys that do something only now glow, and keys that do nothing now fade. */
  emphasis?: boolean;
  /** A smaller keyboard, for beside a list. */
  mini?: boolean;
  /** Pointing at a key tells everything it does, with its memory hook, in a tooltip. */
  tooltips?: boolean;
}>;

/* A key's tooltip: each thing it does, when, and how to remember it. */
function KeyTip({ keyName, now }: Readonly<{ keyName: string; now: readonly Now[] }>) {
  return (
    <span className={styles.tip}>
      {entriesForCap(keyName)
        .toSorted((a, b) => Number(isNow(b, now)) - Number(isNow(a, now)))
        .map((entry) => (
          <span key={entry.id} className={styles.tipLine} data-group={entry.group}>
            <b className={styles.tipAction}>{entry.action}</b>
            <span className={styles.tipWhen}>{isNow(entry, now) ? 'Now' : SITUATION_LABEL[entry.when]}</span>
            {(entry.hook ?? entry.detail) && <span className={styles.tipHook}>{entry.hook ?? entry.detail}</span>}
          </span>
        ))}
    </span>
  );
}

/**
 * The keyboard drawn as the table uses it: every key in its group's colour, saying what it does right now.
 * Shared by the variants that draw the keyboard;
 * a variant decides what sits around it.
 */
export function KeyMap({
  now,
  pressed,
  focus,
  onFocus,
  captions = true,
  emphasis = true,
  mini = false,
  tooltips = false,
}: KeyMapProps) {
  return (
    <div className={styles.keyboard} data-mini={mini || undefined} onMouseLeave={() => onFocus(null)}>
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.row}>
          {row.map((cell, cellIndex) => {
            const [key, width] = typeof cell === 'string' ? [cell, 1] : cell;
            const all = key ? entriesForCap(key) : [];
            const meaning = key ? meaningNow(key, now) : null;
            const shown = meaning ?? all[0];
            const state = !shown ? undefined : !meaning ? 'later' : emphasis && isNow(meaning, now) ? 'now' : 'any';
            const button = (
              <button
                key={`${key}:${cellIndex}`}
                type="button"
                className={styles.key}
                style={{ flexGrow: width }}
                data-group={shown?.group}
                data-state={state}
                data-emphasis={emphasis || undefined}
                data-focus={focus === key || undefined}
                data-blank={!key || undefined}
                disabled={all.length === 0}
                aria-label={all.length ? `${key}: ${all.map((entry) => entry.action).join(', ')}` : key || 'Caps'}
                onMouseEnter={() => onFocus(key)}
                onFocus={() => onFocus(key)}
              >
                {key && (
                  <PressFlash pressed={pressed} keyName={key}>
                    <Kbd>{key}</Kbd>
                  </PressFlash>
                )}
                {captions && shown && !mini && (
                  /* Keyed by the word, so a key that changes meaning fades its new word in. */
                  <span key={shown.id} className={styles.caption}>
                    <Caption entry={shown} keyName={key} />
                  </span>
                )}
              </button>
            );
            return tooltips && all.length > 0 ? (
              <Tooltip
                key={`${key}:${cellIndex}`}
                label={<KeyTip keyName={key} now={now} />}
                multiline
                maw={260}
                withArrow
                openDelay={120}
              >
                {button}
              </Tooltip>
            ) : (
              button
            );
          })}
        </div>
      ))}
    </div>
  );
}
