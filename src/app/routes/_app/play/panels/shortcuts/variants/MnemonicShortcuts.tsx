import { Keys, Word } from './Keys';
import styles from './MnemonicShortcuts.module.css';
import { GROUPS, SHORTCUT_ENTRIES } from './shortcutCatalogue';
import type { ShortcutEntry } from './shortcutCatalogue';

/* A key with a story: a word its letter starts, or a reason it sits where it does. */
const remembered = (entry: ShortcutEntry) => Boolean(entry.word ?? entry.hook) && !entry.pointer;

/**
 * Variant E, memory hooks: every key with a story gets a card that tells it: H for Hand, F for Friend,
 * Q and E either side of W.
 * The letter is big, the word lights the letter, and the reason sits under it.
 * Keys without a story are listed plainly at the end.
 */
export function MnemonicShortcuts() {
  const plain = SHORTCUT_ENTRIES.filter((entry) => !remembered(entry));
  return (
    <div className={styles.root}>
      {GROUPS.map((group) => {
        const cards = SHORTCUT_ENTRIES.filter((entry) => entry.group === group.id && remembered(entry));
        if (cards.length === 0) {
          return null;
        }
        return (
          <section key={group.id} data-group={group.id} aria-label={group.title}>
            <h3 className={styles.heading}>{group.title}</h3>
            <ul className={styles.cards}>
              {cards.map((entry, index) => (
                <li key={entry.id} className={styles.card} style={{ animationDelay: `${index * 35}ms` }}>
                  <span className={styles.cap}>
                    <Keys entry={entry} />
                  </span>
                  <span className={styles.body}>
                    {entry.word ? (
                      <span className={styles.word}>
                        <Word entry={entry} />
                      </span>
                    ) : null}
                    <span className={styles.action}>{entry.action}</span>
                    {entry.hook && <span className={styles.hook}>{entry.hook}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section aria-label="The rest">
        <h3 className={styles.heading}>The rest</h3>
        <ul className={styles.plain}>
          {plain.map((entry) => (
            <li key={entry.id} data-group={entry.group}>
              <Keys entry={entry} /> <span className={styles.muted}>{entry.action}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
