import { Kbd } from '@ui/content/Kbd';
import clsx from 'clsx';
import { Fragment } from 'react';
import type { ReactNode } from 'react';

import type { ShortcutEntry } from './keyboardShortcuts';
import styles from './ShortcutKeys.module.css';

/** An entry's keys as caps: "Hold Alt", "1–9", "Q E", or a pointer gesture in words. */
export function Keys({ entry }: Readonly<{ entry: ShortcutEntry }>) {
  if (entry.pointer) {
    return <span className={styles.pointer}>{entry.keys.join(' ')}</span>;
  }
  if (entry.press === 'range') {
    return (
      <span className={styles.keys}>
        <Kbd>{entry.keys[0]}</Kbd>–<Kbd>{entry.keys[1]}</Kbd>
      </span>
    );
  }
  return (
    <span className={styles.keys}>
      {entry.press === 'hold' && <span className={styles.hold}>Hold</span>}
      {entry.keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 && ' '}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

/** The word a letter key stands for, its letter lit: "Hand" with H lit. */
export function Word({ entry }: Readonly<{ entry: ShortcutEntry }>) {
  const word = entry.word;
  if (!word) {
    return null;
  }
  const letter = entry.keys[0]?.toLowerCase() ?? '';
  const at = word.toLowerCase().indexOf(letter);
  if (at < 0) {
    return <span>{word}</span>;
  }
  return (
    <span className={styles.word}>
      {word.slice(0, at)}
      <strong className={styles.letter}>{word.slice(at, at + 1)}</strong>
      {word.slice(at + 1)}
    </span>
  );
}

/** The class that gives an element with data-group its group's colour role as --group. */
export const tinted = styles.tinted;

/** Wraps a cap so it dips and glows each time the player presses one of its keys; every press replays it. */
export function PressFlash({
  pressed,
  keys,
  children,
}: Readonly<{
  pressed: Readonly<{ key: string; count: number }> | null;
  keys: readonly string[];
  children: ReactNode;
}>) {
  const hit = pressed !== null && keys.includes(pressed.key);
  return (
    <span key={hit ? pressed.count : 'rest'} className={clsx(styles.flash, hit && styles.pressed)}>
      {children}
    </span>
  );
}
