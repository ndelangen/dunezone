import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { IconAction } from '@ui/control/IconAction';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { GROUPS, SHORTCUT_ENTRIES, capsOf, isNow, momentLabel } from './keyboardShortcuts';
import type { Now, ShortcutEntry } from './keyboardShortcuts';
import styles from './KeyboardShortcutsPanel.module.css';
import { Caption, KeyMap } from './KeyMap';
import { KeyStory } from './KeyStory';
import { Keys, PressFlash, tinted } from './ShortcutKeys';
import { usePressedKey } from './usePressedKey';
import type { Pressed } from './usePressedKey';

/* The panel keys are relevant at every moment, so they follow whatever is special right now. */
const PANELS = ['compass', 'hand', 'hidden', 'battle', 'table', 'ally'];

function NowTile({
  entry,
  pressed,
  index,
  lit = false,
}: Readonly<{ entry: ShortcutEntry; pressed: Pressed; index: number; lit?: boolean }>) {
  return (
    <li
      className={clsx(styles.tile, tinted)}
      data-group={entry.group}
      data-now={lit || undefined}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <PressFlash pressed={pressed} keys={capsOf(entry)}>
        <span className={styles.big}>
          <Keys entry={entry} />
        </span>
      </PressFlash>
      <span className={styles.word}>
        <Caption entry={entry} keyName={entry.keys[0] ?? ''} />
      </span>
      {entry.action !== entry.short && <span className={styles.action}>{entry.action}</span>}
    </li>
  );
}

/* Which ends of the row have more tiles past them, kept up to date as it scrolls, resizes or its tiles change. */
function useOverflow(row: RefObject<HTMLUListElement | null>, tiles: string) {
  const [more, setMore] = useState({ before: false, after: false });
  useEffect(() => {
    const element = row.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const before = element.scrollLeft > 2;
      const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
      setMore((last) => (last.before === before && last.after === after ? last : { before, after }));
    };
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [row, tiles]);
  return more;
}

/* When the keys of the moment change, such as bidding opening while the panel is pinned, the row scrolls back to show them. */
function useRowStart(row: RefObject<HTMLUListElement | null>, moment: string) {
  useEffect(() => {
    row.current?.scrollTo({ left: 0 });
  }, [row, moment]);
}

/**
 * The keyboard shortcuts panel, one scrolling sheet in three layers: the keys that matter right now in one horizontal row, then the whole keyboard colour-coded by group, each key's tooltip telling what it does and how to remember it, then every key listed in its colour-coded group with its memory hook.
 * A key pressed while it is open lights in all three.
 */
export function KeyboardShortcutsPanel({ now = [] }: Readonly<{ now?: readonly Now[] }>) {
  const [focus, setFocus] = useState<string | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));
  /* A panel key that a key of this moment takes over, such as F flipping the piece instead of opening Ally chat, leaves the row. */
  const taken = new Set(current.flatMap(capsOf));
  const panels = PANELS.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id)).filter(
    (entry) => !capsOf(entry).some((cap) => taken.has(cap))
  );
  const row = useRef<HTMLUListElement>(null);
  const more = useOverflow(row, [...current, ...panels].map((entry) => entry.id).join(' '));
  const motion = useMotionAllowed();
  const page = (direction: 1 | -1) =>
    row.current?.scrollBy({
      left: direction * row.current.clientWidth * 0.8,
      behavior: motion ? 'smooth' : 'instant',
    });
  useRowStart(row, current.map((entry) => entry.id).join(' '));

  return (
    <div className={styles.root}>
      <section aria-label="Right now">
        <Eyebrow tone="accent">{`Right now · ${momentLabel(now)}`}</Eyebrow>
        <div className={styles.rowFrame}>
          <ul className={styles.row} ref={row}>
            {current.map((entry, index) => (
              <NowTile key={entry.id} entry={entry} pressed={pressed} index={index} lit />
            ))}
            {current.length > 0 && <li className={styles.divider} aria-hidden />}
            {panels.map((entry, index) => (
              <NowTile key={entry.id} entry={entry} pressed={pressed} index={current.length + index} />
            ))}
          </ul>
          {more.before && (
            <span className={styles.edgeBefore}>
              <IconAction label="Earlier keys" icon={<ChevronLeft size={16} />} onClick={() => page(-1)} />
            </span>
          )}
          {more.after && (
            <span className={styles.edgeAfter}>
              <IconAction label="More keys" icon={<ChevronRight size={16} />} onClick={() => page(1)} />
            </span>
          )}
        </div>
      </section>

      <section aria-label="Whole keyboard" className={styles.keyboard}>
        <div className={styles.legend}>
          {GROUPS.map((group) => (
            <span key={group.id} className={clsx(styles.chip, tinted)} data-group={group.id}>
              {group.short}
            </span>
          ))}
        </div>
        <KeyMap now={now} pressed={pressed} focus={focus} onFocus={setFocus} />
      </section>

      {GROUPS.map((group) => (
        <div key={group.id} data-group={group.id} className={clsx(styles.group, tinted)}>
          <Section title={group.title}>
            <ul className={styles.list}>
              {SHORTCUT_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => (
                <KeyStory
                  key={entry.id}
                  entry={entry}
                  now={now}
                  lit={focus !== null && capsOf(entry).includes(focus)}
                />
              ))}
            </ul>
          </Section>
        </div>
      ))}
    </div>
  );
}
