import styles from './KeyDetail.module.css';
import { Keys, Word } from './Keys';
import { SITUATION_LABEL, entriesForCap, isNow } from './shortcutCatalogue';
import type { Now, ShortcutEntry } from './shortcutCatalogue';

/** One key's story: what it does, its word with the letter lit, and why it sits where it does. */
export function KeyStory({
  entry,
  now,
  lit = false,
}: Readonly<{
  entry: ShortcutEntry;
  now: readonly Now[];
  /** Lit with its key elsewhere, such as on a keyboard map beside it. */
  lit?: boolean;
}>) {
  return (
    <li
      className={styles.story}
      data-group={entry.group}
      data-now={isNow(entry, now) || undefined}
      data-lit={lit || undefined}
      data-key={entry.pointer ? undefined : entry.keys[0]}
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
        {(entry.hook ?? entry.detail) && <span className={styles.hook}>{entry.hook ?? entry.detail}</span>}
      </span>
      <span className={styles.when}>{isNow(entry, now) ? 'Now' : SITUATION_LABEL[entry.when]}</span>
    </li>
  );
}

/** Everything one key does, the meaning that holds now first, each with its memory hook. */
export function KeyDetail({ keyName, now }: Readonly<{ keyName: string; now: readonly Now[] }>) {
  const entries = entriesForCap(keyName).toSorted((a, b) => Number(isNow(b, now)) - Number(isNow(a, now)));
  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <KeyStory key={entry.id} entry={entry} now={now} />
      ))}
    </ul>
  );
}
