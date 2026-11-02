import { IconAction } from '@ui/control/IconAction';
import { ExternalLink, UserX } from 'lucide-react';
import type { ReactNode } from 'react';

import type { FactionInfoHeaderModel } from './FactionInfoHeader';
import styles from './FactionInfoToolbar.module.css';

export type FactionInfoToolbarProps = Readonly<{
  page: FactionInfoHeaderModel['page'];
  removal: FactionInfoHeaderModel['removal'];
  /** The alliance action that fits how the viewer stands with the seat's faction, if any. */
  alliance: ReactNode;
  /** The seat's trade action, while seats are traded. */
  trade: ReactNode;
}>;

const ICON = 17;

/**
 * The seat's actions as one row of icons, with their names in the tooltips, coloured as the webapp's toolbars are: the colour says what happens (slate changes nothing, green keeps or accepts, red loses something), and every action wears the standard tile.
 * The faction page is a way out, so it leads on the left;
 * the trade and the alliance follow on the right, and the removal vote, the one red action, stands last.
 * Observers get no action at all: the parts that build each action leave it out for them.
 */
export function FactionInfoToolbar({ page, removal, alliance, trade }: FactionInfoToolbarProps) {
  return (
    <div role="toolbar" aria-label="Seat actions" className={styles.toolbar}>
      <div className={styles.edge}>
        {page && (
          <IconAction
            size="lg"
            emphasis="standard"
            intent="neutral"
            label={`Open the ${page.name} page in a new tab`}
            icon={<ExternalLink size={ICON} />}
            href={page.href}
            target="_blank"
            rel="noreferrer"
          />
        )}
      </div>
      <div className={styles.edge}>
        {trade}
        {alliance}
        {removal && (
          <>
            <span className={styles.gap} aria-hidden />
            <IconAction
              size="lg"
              emphasis="standard"
              intent="negative"
              label="Start removal vote"
              tooltip="Start a vote to remove this player from the game."
              icon={<UserX size={ICON} />}
              disabledReason={removal.disabledReason}
              onClick={removal.start}
            />
          </>
        )}
      </div>
    </div>
  );
}
