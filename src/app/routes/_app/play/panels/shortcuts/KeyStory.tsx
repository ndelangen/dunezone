import { SITUATION_LABEL, isNow } from './keyboardShortcuts';
import type { Now, ShortcutEntry } from './keyboardShortcuts';
import styles from './KeyStory.module.css';
import { Keys, Word } from './ShortcutKeys';

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
      className={styles.story}
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
        {entry.detail && <span className={styles.detail}>{entry.detail}</span>}
        {entry.hook && <span className={styles.hook}>{entry.hook}</span>}
      </span>
      <span className={styles.when}>{isNow(entry, now) ? 'Now' : SITUATION_LABEL[entry.when]}</span>
    </li>
  );
}
