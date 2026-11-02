import { IconAction } from '@ui/control/IconAction';
import { ExternalLink, Undo2, UserCheck, UserX } from 'lucide-react';
import type { ReactNode } from 'react';

import type { FactionInfoHeaderModel } from './FactionInfoHeader';
import type { BallotChoice } from './FactionInfoPanel';
import styles from './FactionInfoToolbar.module.css';

/** The viewer's ballot on the open vote against the seat's player, when the viewer may cast one. */
type ToolbarBallot = Readonly<{
  choice: BallotChoice | null;
  /** Casts the viewer's ballot, or withdraws it with null. */
  cast: (choice: BallotChoice | null) => void;
}>;

export type FactionInfoToolbarProps = Readonly<{
  page: FactionInfoHeaderModel['page'];
  removal: FactionInfoHeaderModel['removal'];
  /** The tech tokens the seat's faction holds, while it holds any. */
  techTokens: ReactNode;
  /** The seat's faction's allies as tokens, while it has any. */
  allies: ReactNode;
  /** The alliance action that fits how the viewer stands with the seat's faction, if any. */
  alliance: ReactNode;
  /** The seat's trade action, while seats are traded. */
  trade: ReactNode;
  ballot: ToolbarBallot | null;
}>;

const ICON = 17;

/* The viewer's ballot as three icons: Remove (red) and Keep (green) stay pressed once cast, and Withdraw takes the ballot back. */
function Ballot({ choice, cast }: ToolbarBallot) {
  return (
    <>
      <IconAction
        size="lg"
        emphasis="standard"
        intent="negative"
        label="Remove"
        tooltip="Vote to remove this player from the game."
        icon={<UserX size={ICON} />}
        pressed={choice === 'remove'}
        onClick={() => cast('remove')}
      />
      <IconAction
        size="lg"
        emphasis="standard"
        intent="positive"
        label="Keep"
        tooltip="Vote to keep this player in the game."
        icon={<UserCheck size={ICON} />}
        pressed={choice === 'keep'}
        onClick={() => cast('keep')}
      />
      <IconAction
        size="lg"
        emphasis="standard"
        intent="neutral"
        label="Withdraw"
        tooltip="Take your vote back."
        icon={<Undo2 size={ICON} />}
        disabledReason={choice === null ? 'You have not voted yet.' : undefined}
        onClick={() => cast(null)}
      />
    </>
  );
}

/**
 * The seat's actions as one row of icons between the header and the content, with full-width rules above and below it, coloured as the webapp's toolbars are: slate changes nothing, green keeps or accepts, red loses something, and every action wears the standard tile.
 * The faction page is a way out, so it leads on the left.
 * On the right the tech tokens the faction holds, its allies and the alliance action, then the trade, then the removal vote: starting one, or the viewer's ballot while one is open.
 * Observers get no action at all: the parts that build each action leave it out for them.
 */
export function FactionInfoToolbar({
  page,
  removal,
  techTokens,
  allies,
  alliance,
  trade,
  ballot,
}: FactionInfoToolbarProps) {
  const vote = ballot ? (
    <Ballot {...ballot} />
  ) : (
    removal && (
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
    )
  );
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
        {techTokens}
        {techTokens && allies && <span className={styles.gap} aria-hidden />}
        {allies}
        {alliance}
        {trade}
        {vote && (
          <>
            <span className={styles.gap} aria-hidden />
            {vote}
          </>
        )}
      </div>
    </div>
  );
}
