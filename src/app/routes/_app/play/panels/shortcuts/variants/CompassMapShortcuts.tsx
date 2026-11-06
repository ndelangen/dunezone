import { Kbd } from '@ui/content/Kbd';

import { SHORTCUTS } from '../../../compass/shortcuts';
import styles from './CompassMapShortcuts.module.css';
import { Keys, PressFlash } from './Keys';
import { SHORTCUT_ENTRIES, entriesOf } from './shortcutCatalogue';
import type { ShortcutGroupId } from './shortcutCatalogue';
import { usePressedKey } from './usePressedKey';

/* The compass arms as the compass lays them out, each with the arrows that reach it and the letter that skips the compass. */
const ARMS = [
  { area: 'up', steer: ['↑'], label: 'Battle plan', letter: SHORTCUTS.battle, from: 'bottom' },
  { area: 'far-left', steer: ['←', '←'], label: 'Private side-table', letter: SHORTCUTS.hidden, from: 'right' },
  { area: 'left', steer: ['←'], label: 'Hand & spice', letter: SHORTCUTS.hand, from: 'right' },
  { area: 'right', steer: ['→'], label: 'Table chat', letter: SHORTCUTS.table, from: 'left' },
  { area: 'far-right', steer: ['→', '→'], label: 'Ally chat', letter: SHORTCUTS.ally, from: 'left' },
] as const;

const BELOW: readonly Readonly<{ group: ShortcutGroupId; title: string }>[] = [
  { group: 'pieces', title: 'On a piece' },
  { group: 'view', title: 'Looking around' },
  { group: 'bidding', title: 'Bidding' },
];

/**
 * Variant D, the compass map: the sheet draws the compass itself, so the arrows and the letters are learnt as one picture.
 * Space, then an arrow, opens a window;
 * its letter opens it without the compass.
 * The table's own keys sit underneath.
 */
export function CompassMapShortcuts() {
  const pressed = usePressedKey();
  const windows = entriesOf('windows').filter((entry) => ['pin', 'close', 'help'].includes(entry.id));

  return (
    <div className={styles.root}>
      <div className={styles.compass} data-group="windows">
        <div className={styles.centre}>
          <PressFlash pressed={pressed} keyName="Space">
            <span className={styles.space}>
              <Kbd>Space</Kbd>
            </span>
          </PressFlash>
          <span className={styles.centreLabel}>then steer, or type to search</span>
        </div>
        {ARMS.map((arm, index) => (
          <div
            key={arm.area}
            className={styles.arm}
            style={{ gridArea: arm.area, animationDelay: `${80 + index * 60}ms` }}
            data-from={arm.from}
          >
            <span className={styles.steer}>
              {arm.steer.map((arrow, at) => (
                <Kbd key={at}>{arrow}</Kbd>
              ))}
            </span>
            <span className={styles.label}>{arm.label}</span>
            <span className={styles.skip}>
              or
              <PressFlash pressed={pressed} keyName={arm.letter}>
                <Kbd>{arm.letter}</Kbd>
              </PressFlash>
            </span>
          </div>
        ))}
      </div>

      <ul className={styles.extras} data-group="windows">
        {windows.map((entry) => (
          <li key={entry.id}>
            <Keys entry={entry} /> {entry.action}
          </li>
        ))}
      </ul>

      <div className={styles.columns}>
        {BELOW.map((column) => (
          <section key={column.group} className={styles.column} data-group={column.group}>
            <h3 className={styles.heading}>{column.title}</h3>
            <ul className={styles.list}>
              {SHORTCUT_ENTRIES.filter((entry) => entry.group === column.group).map((entry) => (
                <li key={entry.id}>
                  <PressFlash pressed={pressed} keyName={entry.keys[0] ?? ''}>
                    <Keys entry={entry} />
                  </PressFlash>
                  <span className={styles.action}>{entry.action}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
