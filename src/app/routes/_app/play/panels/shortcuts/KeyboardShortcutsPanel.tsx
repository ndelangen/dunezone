import { Section } from '@ui/block/Section';
import { KeyedText } from '@ui/content/Kbd';

import { SHORTCUT_GROUPS } from './keyboardShortcuts';
import type { ShortcutGroup } from './keyboardShortcuts';
import styles from './KeyboardShortcutsPanel.module.css';

export type KeyboardShortcutsPanelProps = Readonly<{
  /** The shortcuts by topic; the table's own unless a story shows others. */
  groups?: readonly ShortcutGroup[];
}>;

/** The keyboard shortcuts cheat sheet: every key the table answers to, grouped by what it is for, each drawn as a key cap. */
export function KeyboardShortcutsPanel({ groups = SHORTCUT_GROUPS }: KeyboardShortcutsPanelProps) {
  return (
    <>
      {groups.map((group) => (
        <Section key={group.title} title={group.title} description={group.description}>
          <dl className={styles.list}>
            {group.rows.map((row) => (
              <div key={`${row.keys}:${row.action}`} className={styles.row}>
                <dt className={styles.keys}>
                  <KeyedText>{row.keys}</KeyedText>
                </dt>
                <dd className={styles.action}>
                  <KeyedText>{row.action}</KeyedText>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}
    </>
  );
}
