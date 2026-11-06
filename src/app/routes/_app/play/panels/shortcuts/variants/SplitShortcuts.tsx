import { useState } from 'react';

import styles from './combined.module.css';
import { KeyStory } from './KeyDetail';
import { KeyMap } from './KeyMap';
import { SHORTCUT_ENTRIES, SITUATION_LABEL, capsOf, isNow } from './shortcutCatalogue';
import type { Now, ShortcutEntry } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

const WINDOWS = ['compass', 'hand', 'hidden', 'battle', 'table', 'ally'];

/**
 * Round 2, 4 Map beside the list: a small keyboard on top shows where the keys are;
 * the list beneath says what they do and how to remember them, the keys for right now first.
 * Pointing at a row lights its key on the map, and pointing at a key lights its rows, so place and meaning are learnt together.
 */
export function SplitShortcuts({ now }: Readonly<{ now: readonly Now[] }>) {
  const [focus, setFocus] = useState<string | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));
  const windows = WINDOWS.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id));
  const lit = (entry: ShortcutEntry) => focus !== null && capsOf(entry).includes(focus);

  const rows = (entries: readonly ShortcutEntry[]) => (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <KeyStory key={entry.id} entry={entry} now={now} lit={lit(entry)} />
      ))}
    </ul>
  );

  const pointAt = (target: EventTarget) => {
    const story = target instanceof Element ? target.closest('[data-key]') : null;
    if (story) {
      setFocus(story.getAttribute('data-key'));
    }
  };

  return (
    <div
      className={styles.root}
      /* Pointing at a story lights its key on the map: each story names its key. */
      onMouseOver={(event) => pointAt(event.target)}
      onFocus={(event) => pointAt(event.target)}
    >
      <KeyMap now={now} pressed={pressed} focus={focus} onFocus={setFocus} mini />
      <section aria-label="Right now">
        <h3 className={styles.heading}>
          Right now · {now.length ? now.map((each) => SITUATION_LABEL[each]).join(', ') : 'At the table'}
        </h3>
        {current.length ? rows(current) : <p className={styles.hint}>Nothing special right now.</p>}
      </section>
      <section aria-label="Windows">
        <h3 className={styles.heading}>Windows, any time</h3>
        {rows(windows)}
      </section>
    </div>
  );
}
