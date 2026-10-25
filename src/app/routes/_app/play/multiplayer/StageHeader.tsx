import { Text } from '@mantine/core';
import { setupStep } from '@shared/play/setup';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { InviteLink } from '../GameLink';
import { BidderToolbar } from './BidderToolbar';
import { DraftingHeader, DraftingReady } from './Drafting';
import { ContinuePlaying, resultTitle } from './GameResult';
import { canStepPhase, PhaseNavigation } from './PhaseNavigation';
import { StagePlayback } from './SeatRequests';
import { SwappingReady, SwappingStatus } from './Swapping';
import { stageInPlay } from './tableFactions';

export type GameIdentity = Readonly<{
  rulesetName: string | null;
  address: string;
  /** The page a shared link opens, when the table is not a game at `/play/<address>`, such as a tutorial chapter's. */
  page?: string;
}>;

/** The header's control for the stage: its Ready, the phase controls in play, playback, or Continue playing once finished. */
export function stageToolbar({
  client,
  table,
  error,
  bidderFaded,
  onBidderFadedChange,
}: Readonly<{
  client: TableSession;
  table: TableProjection;
  error: string | null;
  bidderFaded: boolean;
  onBidderFadedChange: (faded: boolean) => void;
}>) {
  const stage = table.snapshot.stage;
  const inPlay = stageInPlay(stage);
  /* Playback steps through the checkpoints from the header in every stage, so no tab hides the way back to live. */
  const playback = table.playback ? <StagePlayback client={client} table={table} error={error} /> : null;
  /* In play the header steps phases beside the bidder; setup steps its phases alone. */
  if (inPlay || settingUp(table)) {
    return (
      <>
        {playback}
        {inPlay && (
          <BidderToolbar client={client} table={table} faded={bidderFaded} onFadedChange={onBidderFadedChange} />
        )}
        <PhaseNavigation client={client} table={table} />
      </>
    );
  }
  if (playback) {
    return playback;
  }
  const Control = STAGE_CONTROLS[stage ?? ''];
  return Control ? <Control client={client} table={table} /> : undefined;
}

/** Setup steps its phases once its first step is dealt. */
function settingUp(table: TableProjection): boolean {
  return table.snapshot.stage === 'setup' && Boolean(table.snapshot.setup);
}

/** Stepping to the next phase, as the header's button does; null wherever that button is absent or disabled. */
export function nextPhaseStep(client: TableSession, table: TableProjection): (() => void) | null {
  const shown = stageInPlay(table.snapshot.stage) || settingUp(table);
  return shown && canStepPhase(table) ? () => client.command({ kind: 'phase' }) : null;
}

/** The control a stage with no phases to step puts in the header: its Ready, or Continue playing once finished. */
const STAGE_CONTROLS: Partial<
  Record<string, (props: Readonly<{ client: TableSession; table: TableProjection }>) => ReactNode>
> = {
  drafting: DraftingReady,
  swapping: SwappingReady,
  finished: ContinuePlaying,
};

/** What the phase chip says for a stage outside play: the drafting gates, the trading clock, the result or the setup step. */
export function stageStatus({
  client,
  table,
  identity,
}: Readonly<{ client: TableSession; table: TableProjection; identity: GameIdentity }>) {
  const stage = table.snapshot.stage;
  const result = resultTitle(table);
  if (stage === 'drafting') {
    return (
      <DraftingHeader
        table={table}
        rulesetName={identity.rulesetName ?? undefined}
        invite={<InviteLink address={identity.address} />}
      />
    );
  }
  if (stage === 'swapping') {
    return <SwappingStatus client={client} table={table} />;
  }
  if (result) {
    return (
      <div className="seated-phase-status__copy">
        <span>Finished</span>
        <strong>{result}</strong>
      </div>
    );
  }
  if (stage === 'discarded') {
    return (
      <div className="seated-phase-status__copy">
        <span>Discarded</span>
        <strong>Its last player left</strong>
      </div>
    );
  }
  if (stage === 'setup' && table.snapshot.setup) {
    return <Text size="sm">{setupStep(table.snapshot.setup).title}</Text>;
  }
  return undefined;
}
