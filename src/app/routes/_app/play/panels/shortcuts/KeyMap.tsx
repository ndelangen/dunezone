import { Tooltip } from '@mantine/core';
import { Kbd } from '@ui/content/Kbd';

import { SITUATION_LABEL, entriesForCap, isNow, meaningNow } from './keyboardShortcuts';
import type { Now, ShortcutEntry } from './keyboardShortcuts';
import styles from './KeyMap.module.css';
import { PressFlash } from './ShortcutKeys';
import type { Pressed } from './usePressedKey';

/* The keyboard, as far as the table uses it; a number is how many key widths a wide key takes, and '' is an unused gap. */
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

type KeyMapProps = Readonly<{
  /** What holds at the table: each key shows what it does now, and keys that only work now glow. */
  now: readonly Now[];
  pressed: Pressed;
  /** The key pointed at or pressed last, outlined. */
  focus: string | null;
  onFocus: (key: string | null) => void;
}>;

/* A key's tooltip: each thing it does, the meaning that holds now first, when, and how to remember it. */
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

/* One key: its cap and its word for now, in its group's colour; a key the table does not use stays a quiet outline. */
function Key({ keyName, width, ...props }: KeyMapProps & Readonly<{ keyName: string; width: number }>) {
  const { now, pressed, focus, onFocus } = props;
  const all = entriesForCap(keyName);
  if (all.length === 0) {
    return (
      <span className={styles.key} style={{ flexGrow: width }} data-blank={!keyName || undefined} aria-hidden>
        {keyName && <Kbd>{keyName}</Kbd>}
      </span>
    );
  }
  const meaning = meaningNow(keyName, now);
  const shown = meaning ?? all[0]!;
  const state = !meaning ? 'later' : isNow(meaning, now) ? 'now' : 'any';
  return (
    <Tooltip label={<KeyTip keyName={keyName} now={now} />} multiline maw={260} withArrow openDelay={120}>
      <button
        type="button"
        className={styles.key}
        style={{ flexGrow: width }}
        data-group={shown.group}
        data-state={state}
        data-focus={focus === keyName || undefined}
        aria-label={`${keyName}: ${all.map((entry) => entry.action).join(', ')}`}
        onMouseEnter={() => onFocus(keyName)}
        onFocus={() => onFocus(keyName)}
        onClick={() => onFocus(keyName)}
      >
        <PressFlash pressed={pressed} keyName={keyName}>
          <Kbd>{keyName}</Kbd>
        </PressFlash>
        {/* Keyed by the meaning, so a key that changes meaning fades its new word in. */}
        <span key={shown.id} className={styles.caption}>
          <Caption entry={shown} keyName={keyName} />
        </span>
      </button>
    </Tooltip>
  );
}

/**
 * The keyboard drawn as the table uses it: every key in its group's colour with its word for what it does right now.
 * Keys that only work now glow, keys that do nothing now fade, and each key's tooltip tells all it does and how to remember it.
 */
export function KeyMap(props: KeyMapProps) {
  return (
    <div className={styles.keyboard} onMouseLeave={() => props.onFocus(null)}>
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.row}>
          {row.map((cell, cellIndex) => {
            const [keyName, width] = typeof cell === 'string' ? [cell, 1] : cell;
            return <Key key={`${keyName}:${cellIndex}`} keyName={keyName} width={width} {...props} />;
          })}
        </div>
      ))}
    </div>
  );
}
