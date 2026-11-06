import { Kbd } from '@ui/content/Kbd';
import { LabeledAction } from '@ui/control/LabeledAction';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import styles from './combined.module.css';
import { KeyDetail } from './KeyDetail';
import { Caption, KeyMap } from './KeyMap';
import { Keys, PressFlash } from './Keys';
import own from './NowStripShortcuts.module.css';
import { SHORTCUT_ENTRIES, SITUATION_LABEL, isNow } from './shortcutCatalogue';
import type { Now } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

const WINDOWS = ['hand', 'hidden', 'battle', 'table', 'ally'];

/**
 * Round 2, 6 Quick strip, whole keyboard on demand: a short window by default, just the keys for right now and the window letters as chips with their words lit.
 * Pointing at a chip tells its hook.
 * "Whole keyboard" unfolds the keyboard map below for everything else, and it stays unfolded the next time.
 */
export function NowStripShortcuts({
  now,
  open: initiallyOpen = false,
}: Readonly<{ now: readonly Now[]; open?: boolean }>) {
  const [open, setOpen] = useState(initiallyOpen);
  const [focus, setFocus] = useState<string | null>(null);
  const pressed = usePressedKey((key) => setFocus(key));
  const current = SHORTCUT_ENTRIES.filter((entry) => isNow(entry, now));
  const windows = WINDOWS.flatMap((id) => SHORTCUT_ENTRIES.filter((entry) => entry.id === id));

  const chips = (entries: typeof current) =>
    entries.map((entry) => (
      <li key={entry.id}>
        <button
          type="button"
          className={own.chip}
          data-group={entry.group}
          data-focus={focus !== null && entry.keys.includes(focus) ? true : undefined}
          onMouseEnter={() => setFocus(entry.keys[0] ?? null)}
          onMouseLeave={() => setFocus(null)}
          onFocus={() => setFocus(entry.keys[0] ?? null)}
        >
          <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
            <Keys entry={entry} />
          </PressFlash>
          <span className={own.word}>
            <Caption entry={entry} keyName={entry.keys[0] ?? ''} />
          </span>
        </button>
      </li>
    ));

  return (
    <div className={styles.root}>
      {current.length > 0 && (
        <>
          <p className={styles.eyebrow}>Right now · {now.map((each) => SITUATION_LABEL[each]).join(', ')}</p>
          <ul className={own.chips}>{chips(current)}</ul>
        </>
      )}
      <h3 className={styles.heading}>
        Windows · or <Kbd>Space</Kbd> for the compass
      </h3>
      <ul className={own.chips}>{chips(windows)}</ul>
      <div className={styles.panel} aria-live="polite">
        {focus ? (
          <KeyDetail keyName={focus} now={now} />
        ) : (
          <p className={styles.hint}>Point at a key, or press one, for how to remember it.</p>
        )}
      </div>
      <div className={own.toggle}>
        <LabeledAction
          icon={open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          onClick={() => setOpen((was) => !was)}
          pressed={open}
        >
          Whole keyboard
        </LabeledAction>
      </div>
      {open && (
        <div className={own.unfold}>
          <KeyMap now={now} pressed={pressed} focus={focus} onFocus={setFocus} />
        </div>
      )}
    </div>
  );
}
