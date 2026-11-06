import { IconAction } from '@ui/control/IconAction';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

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

/* Which ends of the row have more tiles past them, kept up to date as it scrolls or resizes. */
function useOverflow(row: RefObject<HTMLUListElement | null>) {
  const [more, setMore] = useState({ before: false, after: false });
  useEffect(() => {
    const element = row.current;
    if (!element) {
      return;
    }
    const measure = () =>
      setMore({
        before: element.scrollLeft > 2,
        after: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
      });
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [row]);
  return more;
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
  const row = useRef<HTMLUListElement>(null);
  const more = useOverflow(row);
  const page = (direction: 1 | -1) =>
    row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className={styles.root}>
      <section aria-label="Right now">
        <p className={styles.eyebrow}>
          Right now · {now.length ? now.map((each) => SITUATION_LABEL[each]).join(', ') : 'At the table'}
        </p>
        <div className={own.rowFrame} data-before={more.before || undefined} data-after={more.after || undefined}>
          <ul className={own.row} ref={row}>
            {current.map((entry, index) => (
              <NowTile key={entry.id} entry={entry} pressed={pressed} index={index} />
            ))}
            {current.length > 0 && <li className={own.divider} aria-hidden />}
            {windows.map((entry, index) => (
              <NowTile key={entry.id} entry={entry} pressed={pressed} index={current.length + index} />
            ))}
          </ul>
          {more.before && (
            <span className={own.edgeBefore}>
              <IconAction label="Earlier keys" icon={<ChevronLeft size={16} />} onClick={() => page(-1)} />
            </span>
          )}
          {more.after && (
            <span className={own.edgeAfter}>
              <IconAction label="More keys" icon={<ChevronRight size={16} />} onClick={() => page(1)} />
            </span>
          )}
        </div>
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
