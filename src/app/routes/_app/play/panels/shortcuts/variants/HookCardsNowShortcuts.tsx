import styles from './combined.module.css';
import own from './HookCardsNowShortcuts.module.css';
import { Keys, PressFlash, Word } from './Keys';
import { SHORTCUT_ENTRIES, SITUATION_LABEL, isNow } from './shortcutCatalogue';
import type { Now, ShortcutEntry } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';
import type { Pressed } from './usePressedKey';

function HookCard({
  entry,
  pressed,
  size,
}: Readonly<{ entry: ShortcutEntry; pressed: Pressed; size: 'big' | 'small' }>) {
  return (
    <li className={own.card} data-group={entry.group} data-size={size}>
      <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
        <span className={own.cap}>
          <Keys entry={entry} />
        </span>
      </PressFlash>
      <span className={own.body}>
        {entry.word && (
          <span className={own.word}>
            <Word entry={entry} />
          </span>
        )}
        <span className={own.action}>{entry.action}</span>
        {size === 'big' && entry.hook && <span className={own.hook}>{entry.hook}</span>}
        {size === 'small' && <span className={own.when}>{SITUATION_LABEL[entry.when]}</span>}
      </span>
    </li>
  );
}

/**
 * Round 2, 5 Memory cards, now first: the memory hook cards, ordered by the moment.
 * The cards for right now come first and largest, the keys that work anywhere next, and the keys for other moments last as small cards that say when they apply.
 */
export function HookCardsNowShortcuts({ now }: Readonly<{ now: readonly Now[] }>) {
  const pressed = usePressedKey();
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));
  const anytime = SHORTCUT_ENTRIES.filter((entry) => entry.when === 'table');
  const other = SHORTCUT_ENTRIES.filter((entry) => entry.when !== 'table' && !isNow(entry, now));

  return (
    <div className={styles.root}>
      {current.length > 0 && (
        <section aria-label="Right now">
          <p className={styles.eyebrow}>Right now · {now.map((each) => SITUATION_LABEL[each]).join(', ')}</p>
          <ul className={own.cards} data-size="big">
            {current.map((entry) => (
              <HookCard key={entry.id} entry={entry} pressed={pressed} size="big" />
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Anywhere">
        <h3 className={styles.heading}>Anywhere over the table</h3>
        <ul className={own.cards} data-size="big">
          {anytime.map((entry) => (
            <HookCard key={entry.id} entry={entry} pressed={pressed} size="big" />
          ))}
        </ul>
      </section>
      <section aria-label="Other moments">
        <h3 className={styles.heading}>Other moments</h3>
        <ul className={own.cards} data-size="small">
          {other.map((entry) => (
            <HookCard key={entry.id} entry={entry} pressed={pressed} size="small" />
          ))}
        </ul>
      </section>
    </div>
  );
}
