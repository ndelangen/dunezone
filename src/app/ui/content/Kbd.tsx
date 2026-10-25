import { Fragment } from 'react';
import type { ReactNode } from 'react';

import styles from './Kbd.module.css';

/**
 * A key on the keyboard, drawn as a key cap: Space, Alt, Enter or an arrow.
 * It takes its colours from the text around it, so one cap reads on the dark table and on paper alike.
 */
export function Kbd({ children }: Readonly<{ children: ReactNode }>) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/* A key named in braces, as in "Press {Space}, then {←}". */
const KEY = /\{([^{}]+)\}/g;

/**
 * Prose that names keys: every `{Key}` in the text shows as a key cap, the rest as plain text.
 * Instructions keep their keys in their words this way, rather than splitting each sentence into parts.
 */
export function KeyedText({ children }: Readonly<{ children: string }>) {
  const parts = children.split(KEY);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Kbd key={`${index}:${part}`}>{part}</Kbd>
        ) : (
          <Fragment key={`${index}:${part}`}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** The words of keyed prose, without the braces: for labels, titles and anything else that is read rather than shown. */
export const keyedPlain = (text: string) => text.replace(KEY, '$1');
