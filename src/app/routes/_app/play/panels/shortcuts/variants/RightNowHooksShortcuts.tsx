import { Kbd } from '@ui/content/Kbd';

import styles from './combined.module.css';
import { KeyStory } from './KeyDetail';
import { Caption } from './KeyMap';
import { Keys, PressFlash, Word } from './Keys';
import own from './RightNowHooksShortcuts.module.css';
import { SHORTCUT_ENTRIES, SITUATIONS, SITUATION_LABEL, isNow } from './shortcutCatalogue';
import type { Now } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

const WINDOWS = ['compass', 'hand', 'hidden', 'battle', 'table', 'ally'];

/**
 * Round 2, 3 Right now, with hooks: the keys that work this moment as big tiles, each telling how to remember it
 * (P for Pass, I and O side by side).
 * The window keys run along one strip with their words lit, and every other moment waits folded away, its keys with their hooks too.
 */
export function RightNowHooksShortcuts({ now }: Readonly<{ now: readonly Now[] }>) {
  const pressed = usePressedKey();
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));
  const windows = WINDOWS.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id));
  const anytime = SHORTCUT_ENTRIES.filter((entry) => entry.when === 'table' && !WINDOWS.includes(entry.id));
  const later = SITUATIONS.filter((situation) => situation.id !== 'table' && !now.includes(situation.id as Now));

  return (
    <div className={styles.root}>
      <p className={styles.eyebrow}>
        Right now · {now.length ? now.map((each) => SITUATION_LABEL[each]).join(', ') : 'At the table'}
      </p>
      {current.length > 0 && (
        <ul className={own.tiles}>
          {current.map((entry, index) => (
            <li
              key={entry.id}
              className={own.tile}
              data-group={entry.group}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
                <span className={own.big}>
                  <Keys entry={entry} />
                </span>
              </PressFlash>
              <span className={own.action}>{entry.action}</span>
              {entry.word && (
                <span className={own.word}>
                  <Word entry={entry} />
                </span>
              )}
              {entry.hook && <span className={own.hook}>{entry.hook}</span>}
            </li>
          ))}
        </ul>
      )}

      <ul className={own.strip} aria-label="Windows, any time">
        {windows.map((entry) => (
          <li key={entry.id} data-group={entry.group}>
            <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
              <Kbd>{entry.keys[0]}</Kbd>
            </PressFlash>
            <span className={own.stripWord}>
              <Caption entry={entry} keyName={entry.keys[0] ?? ''} />
            </span>
          </li>
        ))}
      </ul>

      <details className={own.more}>
        <summary>Other keys over the table</summary>
        <ul className={styles.list}>
          {anytime.map((entry) => (
            <KeyStory key={entry.id} entry={entry} now={now} />
          ))}
        </ul>
      </details>
      {later.map((situation) => (
        <details key={situation.id} className={own.more}>
          <summary>{situation.label}</summary>
          <ul className={styles.list}>
            {SHORTCUT_ENTRIES.filter((entry) => entry.when === situation.id).map((entry) => (
              <KeyStory key={entry.id} entry={entry} now={now} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
