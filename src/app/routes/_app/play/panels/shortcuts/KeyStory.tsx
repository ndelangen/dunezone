import clsx from 'clsx';

import { isNow, whenLabel } from './keyboardShortcuts';
import type { Now, ShortcutEntry } from './keyboardShortcuts';
import styles from './KeyStory.module.css';
import { Keys, Word, tinted } from './ShortcutKeys';

/* The key's word beside its action, unless the word is the action itself: "Hand" beside "Hand window". */
function ActionWord({ entry }: Readonly<{ entry: ShortcutEntry }>) {
  if (!entry.word || entry.word === entry.action) {
    return null;
  }
  return (
    <span className={styles.word}>
      {' · '}
      <Word entry={entry} />
    </span>
  );
}

/* The detail line; a run of digits adds that 0 stands for ten. */
function detailOf(entry: ShortcutEntry) {
  return [entry.detail, entry.press === 'range' ? '0 for ten.' : undefined].filter(Boolean).join(' ');
}

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
  const live = isNow(entry, now);
  return (
    <li
      className={clsx(styles.story, tinted)}
      data-group={entry.group}
      data-now={live || undefined}
      data-lit={lit || undefined}
    >
      <span className={styles.caps}>
        <Keys entry={entry} wrap />
      </span>
      <span className={styles.text}>
        <span className={styles.action}>
          {entry.action}
          <ActionWord entry={entry} />
        </span>
        {detailOf(entry) && <span className={styles.detail}>{detailOf(entry)}</span>}
        {entry.hook && <span className={styles.hook}>{entry.hook}</span>}
      </span>
      <span className={styles.when}>{live ? 'Now' : whenLabel(entry)}</span>
    </li>
  );
}
