import { Kbd } from '@ui/content/Kbd';

import { Keys, PressFlash } from './Keys';
import styles from './RightNowShortcuts.module.css';
import { SHORTCUT_ENTRIES, SITUATIONS } from './shortcutCatalogue';
import type { Situation } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

/* The window keys a player wants at any moment, shown as one strip. */
const ALWAYS = ['compass', 'hand', 'hidden', 'battle', 'table', 'ally'];

/**
 * Variant C, right now: the keys that do something this moment come first, big, and the rest wait folded away.
 * The table says what holds (bidding, a piece under the pointer, carrying), so the sheet answers "what can I press now?".
 */
export function RightNowShortcuts({ now }: Readonly<{ now: readonly Exclude<Situation, 'table'>[] }>) {
  const pressed = usePressedKey();
  const current = SHORTCUT_ENTRIES.filter((entry) => now.includes(entry.when as Exclude<Situation, 'table'>));
  const always = ALWAYS.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id));
  const later = SITUATIONS.filter((situation) => situation.id !== 'table' && !now.includes(situation.id as never));
  const rest = SHORTCUT_ENTRIES.filter((entry) => entry.when === 'table' && !ALWAYS.includes(entry.id));

  return (
    <div className={styles.root}>
      <section aria-label="Right now">
        <p className={styles.eyebrow}>
          Right now ·{' '}
          {now.length
            ? SITUATIONS.filter((s) => now.includes(s.id as never))
                .map((s) => s.label)
                .join(', ')
            : 'Nothing in hand'}
        </p>
        {current.length === 0 ? (
          <p className={styles.quiet}>Point at a piece, or wait for bidding, and its keys show up here.</p>
        ) : (
          <ul className={styles.hero}>
            {current.map((entry, index) => (
              <li
                key={entry.id}
                className={styles.tile}
                data-group={entry.group}
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
                  <span className={styles.big}>
                    <Keys entry={entry} />
                  </span>
                </PressFlash>
                <span className={styles.action}>{entry.action}</span>
                {entry.detail && <span className={styles.detail}>{entry.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Windows, any time" className={styles.strip}>
        {always.map((entry) => (
          <span key={entry.id} className={styles.stripItem} data-group={entry.group}>
            <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
              <Kbd>{entry.keys[0]}</Kbd>
            </PressFlash>
            {entry.action.replace('Open the ', '')}
          </span>
        ))}
      </section>

      <details className={styles.more}>
        <summary>Other keys over the table</summary>
        <ul className={styles.list}>
          {rest.map((entry) => (
            <li key={entry.id} data-group={entry.group}>
              <Keys entry={entry} /> <span>{entry.action}</span>
            </li>
          ))}
        </ul>
      </details>
      {later.map((situation) => (
        <details key={situation.id} className={styles.more}>
          <summary>{situation.label}</summary>
          <ul className={styles.list}>
            {SHORTCUT_ENTRIES.filter((entry) => entry.when === situation.id).map((entry) => (
              <li key={entry.id} data-group={entry.group}>
                <Keys entry={entry} /> <span>{entry.action}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
