import { Button, Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { MOVEMENT_PHASE_ID, movementOrder } from '@shared/play/movement';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { reviewRunning } from '@shared/play/review';
import { setupStep } from '@shared/play/setup';
import { stormOrder } from '@shared/play/stormSector';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { InviteLink } from '../GameLink';
import { BidderToolbar } from './BidderToolbar';
import { DraftingHeader, DraftingReady } from './Drafting';
import { ContinuePlaying, resultTitle } from './GameResult';
import { MovementTurns } from './MovementTurns';
import { canStepPhase, PhaseNavigation } from './PhaseNavigation';
import { StagePlayback } from './SeatRequests';
import { SwappingReady, SwappingStatus } from './Swapping';
import { stageInPlay } from './tableFactions';
import { TableReviewBar } from './TableReview';

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
  /*
   * Playback steps through the checkpoints from the header in every stage, so no tab hides the way back to live.
   * A replayed table takes no actions, so it shows none: only the playback controls.
   */
  /* A running recall puts shared history in its own panel and keeps the return action in the header. */
  if (reviewRunning(table.review?.current)) {
    return <TableReviewBar client={client} table={table} />;
  }
  if (table.playback) {
    return <StagePlayback client={client} table={table} error={error} />;
  }
  /* In play the header steps phases beside the bidder; setup steps its phases alone. An open review vote waits beside them. */
  if (inPlay || settingUp(table)) {
    return (
      <>
        <TableReviewBar client={client} table={table} />
        {inPlay && (
          <BidderToolbar client={client} table={table} faded={bidderFaded} onFadedChange={onBidderFadedChange} />
        )}
        <PhaseNavigation client={client} table={table} />
      </>
    );
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
  const recall = table.review?.current;
  if (reviewRunning(recall)) {
    const unavailable = table.playback?.step !== recall.step;
    const failure = unavailable && !table.historyPending ? client.getSnapshot().error : null;
    return (
      <div className="seated-phase-status__copy">
        <span>Mentat recall</span>
        <strong>{recall.context}</strong>
        {failure ? (
          <>
            <Text size="xs" role="alert">
              Checkpoint unavailable: {failure}
            </Text>
            <Button size="xs" variant="subtle" onClick={client.retryRecall}>
              Retry checkpoint
            </Button>
          </>
        ) : (
          (table.historyPending || unavailable) && (
            <Text size="xs" role="status">
              Loading checkpoint...
            </Text>
          )
        )}
      </div>
    );
  }
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

/** Whether the table plays Shipment and Movement now. */
function movementPhase(table: TableProjection) {
  return phaseAt(table.snapshot.phase, table.snapshot.phases ?? STANDARD_PHASES).id === MOVEMENT_PHASE_ID;
}

/**
 * The Shipment and Movement turns in the phase chip: every faction's token in the order the table plays, for a seated player to mark done or not done and to rearrange.
 * Marking a faction done saves a checkpoint a table review can look at.
 * Playback and a running review show the phase alone, as the turns they look back on are not the table's to change.
 */
export function PhaseTurns({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const roster = table.snapshot.roster;
  const movement = table.snapshot.movement;
  const order = useMemo(
    () => movementOrder(stormOrder(table.state.stormSectorIndex, roster, table.state.pieces), movement),
    [table.state.stormSectorIndex, roster, table.state.pieces, movement]
  );
  if (
    !stageInPlay(table.snapshot.stage) ||
    !roster ||
    !movementPhase(table) ||
    table.playback ||
    reviewRunning(table.review?.current)
  ) {
    return null;
  }
  return (
    <MovementTurns
      table={table}
      order={order}
      done={movement?.done ?? []}
      names={snapshotFactionLabels(table.snapshot)}
      canAct={table.canInteract}
      onDone={(factionId) => client.command({ kind: 'movement-done', factionId })}
      onUndo={(factionId) => client.command({ kind: 'movement-undo', factionId })}
      onOrder={(next) => client.command({ kind: 'movement-order', order: next })}
    />
  );
}
