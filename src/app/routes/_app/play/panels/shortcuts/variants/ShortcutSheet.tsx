import { useState } from 'react';

import styles from './combined.module.css';
import { KeyStory } from './KeyDetail';
import { Caption, KeyMap } from './KeyMap';
import { Keys, PressFlash } from './Keys';
import { GROUPS, SHORTCUT_ENTRIES, SITUATION_LABEL, isNow } from './shortcutCatalogue';
import type { Now, ShortcutEntry } from './shortcutCatalogue';
import own from './ShortcutSheet.module.css';
import { usePressedKey } from './usePressedKey';
import type { Pressed } from './usePressedKey';

/* The window keys are relevant at every moment, so they follow whatever is special right now. */
const WINDOWS = ['compass', 'hand', 'hidden', 'battle', 'table', 'ally'];

function NowTile({ entry, pressed, index }: Readonly<{ entry: ShortcutEntry; pressed: Pressed; index: number }>) {
  return (
    <li className={own.tile} data-group={entry.group} style={{ animationDelay: `${index * 40}ms` }}>
      <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
        <span className={own.big}>
          <Keys entry={entry} />
        </span>
      </PressFlash>
      <span className={own.word}>
        <Caption entry={entry} keyName={entry.keys[0] ?? ''} />
      </span>
      {entry.action !== entry.short && <span className={own.action}>{entry.action}</span>}
    </li>
  );
}

/**
 * The shortcut sheet as Norbert drew it, one scrolling window in three layers: the keys that matter right now in one horizontal row;
 * under it the whole keyboard, colour-coded, each key's tooltip telling what it does and how to remember it;
 * under that every key listed in its colour-coded group, with its memory hook.
 */
export function ShortcutSheet({ now }: Readonly<{ now: readonly Now[] }>) {
  const [focus, setFocus] = useState<string | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));
  const windows = WINDOWS.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id));

  return (
    <div className={styles.root}>
      <section aria-label="Right now">
        <p className={styles.eyebrow}>
          Right now · {now.length ? now.map((each) => SITUATION_LABEL[each]).join(', ') : 'At the table'}
        </p>
        <ul className={own.row}>
          {current.map((entry, index) => (
            <NowTile key={entry.id} entry={entry} pressed={pressed} index={index} />
          ))}
          {current.length > 0 && <li className={own.divider} aria-hidden />}
          {windows.map((entry, index) => (
            <NowTile key={entry.id} entry={entry} pressed={pressed} index={current.length + index} />
          ))}
        </ul>
      </section>

      <section aria-label="Whole keyboard" className={own.keyboard}>
        <div className={own.legend}>
          {GROUPS.map((group) => (
            <span key={group.id} className={own.chip} data-group={group.id}>
              {group.short}
            </span>
          ))}
        </div>
        <KeyMap now={now} pressed={pressed} focus={focus} onFocus={setFocus} tooltips />
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} aria-label={group.title} data-group={group.id} className={own.group}>
          <h3 className={own.groupTitle}>{group.title}</h3>
          <ul className={own.list}>
            {SHORTCUT_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => (
              <KeyStory key={entry.id} entry={entry} now={now} lit={focus !== null && entry.keys.includes(focus)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
