import { SUPPORTING_LEADER_LIMIT } from '@shared/factions/schema';
import clsx from 'clsx';
import { useRef } from 'react';
import type { CSSProperties } from 'react';

import { HOUSE_ATREIDES as FACTION } from './houseAtreides';
import styles from './SavedCheck.module.css';
import { useSeen } from './useSeen';

/*
 * The figure for where a faction lives: House Atreides as one paper slip, each line ticked off against the rule the server checks it with, then stamped into the factions table.
 * The rules are the ones `FactionWriteSchema` in `@shared/factions/schema` applies to every save, worded for a reader.
 * A slip and a stamp, rather than lines or a tray, so the post's figures each have their own look.
 */

const LINES: readonly { field: string; value: string; rule: string }[] = [
  { field: 'name', value: FACTION.name, rule: 'has a letter or number, for its web address' },
  { field: 'logo', value: FACTION.logo.split('/').at(-1) ?? FACTION.logo, rule: 'is one of the library’s logos' },
  { field: 'theme colour', value: FACTION.themeColor, rule: 'is a hex colour' },
  { field: 'table colours', value: FACTION.colors.join(', '), rule: 'are Tabletop Simulator player colours' },
  {
    field: 'leaders',
    value: `${FACTION.factionLeader.name} + ${FACTION.leaders.length}`,
    rule: `${SUPPORTING_LEADER_LIMIT} at most besides the faction leader`,
  },
  {
    field: 'advantages',
    value: `${FACTION.rules.advantages.length} rules`,
    rule: 'each has text, and may have a title and a Karama',
  },
];

export function SavedCheck() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { armed, seen } = useSeen(rootRef);

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, armed && !seen && styles.waiting)}
      role="group"
      aria-label={`${FACTION.name}, checked against the save rules`}
    >
      <div className={styles.slip}>
        <p className={styles.heading}>
          <span>Faction</span>
          <span>checked on save</span>
        </p>
        <ul className={styles.lines}>
          {LINES.map((line, index) => (
            <li key={line.field} className={styles.line} style={{ '--line': index } as CSSProperties}>
              <span className={styles.field}>{line.field}</span>
              <span className={styles.value}>{line.value}</span>
              <span className={styles.tick} aria-hidden="true">
                ✓
              </span>
              <span className={styles.rule}>{line.rule}</span>
            </li>
          ))}
        </ul>
        <p className={styles.stamp} style={{ '--line': LINES.length } as CSSProperties}>
          <span className={styles.stampTitle}>Saved</span>
          <span className={styles.stampSub}>one document in factions</span>
        </p>
      </div>
    </div>
  );
}
