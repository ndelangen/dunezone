import clsx from 'clsx';

import { isNow, whenLabel } from './keyboardShortcuts';
import type { Now, ShortcutEntry } from './keyboardShortcuts';
import styles from './KeyStory.module.css';
import { Keys, Word, tinted } from './ShortcutKeys';

/** One key's story: what it does, its word with the letter lit, and why it sits where it does. */
export function KeyStory({
  entry,
  now,
  lit = false,
}: Readonly<{
  entry: ShortcutEntry;
  now: readonly Now[];
  /** Lit with its key on the keyboard above, while that key is pointed at or pressed. */
  lit?: boolean;
}>) {
  return (
    <li
      className={clsx(styles.story, tinted)}
      data-group={entry.group}
      data-now={isNow(entry, now) || undefined}
      data-lit={lit || undefined}
    >
      <span className={styles.caps}>
        <Keys entry={entry} />
      </span>
      <span className={styles.text}>
        <span className={styles.action}>
          {entry.action}
          {entry.word && (
            <span className={styles.word}>
              {' · '}
              <Word entry={entry} />
            </span>
          )}
        </span>
        {(entry.detail || entry.press === 'range') && (
          <span className={styles.detail}>
            {[entry.detail, entry.press === 'range' && '0 for ten.'].filter(Boolean).join(' ')}
          </span>
        )}
        {entry.hook && <span className={styles.hook}>{entry.hook}</span>}
      </span>
      <span className={styles.when}>{isNow(entry, now) ? 'Now' : whenLabel(entry)}</span>
    </li>
  );
}
