import { useState } from 'react';

import styles from './combined.module.css';
import { KeyDetail, KeyStory } from './KeyDetail';
import { KeyMap } from './KeyMap';
import { SHORTCUT_ENTRIES, SITUATION_LABEL, isNow } from './shortcutCatalogue';
import type { Now } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

/**
 * Round 2, 1 Live keyboard: the keyboard map, each key carrying the word for what it does right now.
 * Keys that only work now glow;
 * keys that do nothing now fade.
 * Point at or press a key for its whole story and its memory hook;
 * until then, the glowing keys' stories show underneath.
 */
export function LiveKeyboardShortcuts({ now }: Readonly<{ now: readonly Now[] }>) {
  const [focus, setFocus] = useState<string | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));

  return (
    <div className={styles.root}>
      <p className={styles.eyebrow}>
        Right now · {now.length ? now.map((each) => SITUATION_LABEL[each]).join(', ') : 'At the table'}
      </p>
      <KeyMap now={now} pressed={pressed} focus={focus} onFocus={setFocus} />
      <div className={styles.panel} aria-live="polite">
        {focus ? (
          <KeyDetail keyName={focus} now={now} />
        ) : current.length ? (
          <ul className={styles.list}>
            {current.map((entry) => (
              <KeyStory key={entry.id} entry={entry} now={now} />
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Point at a key, or press one, for what it does and how to remember it.</p>
        )}
      </div>
    </div>
  );
}
