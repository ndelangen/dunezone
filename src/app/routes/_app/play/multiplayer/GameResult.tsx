import { phaseAt } from '@shared/play/phases';
import { describeResult } from '@shared/play/result';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Play, Trophy } from 'lucide-react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { factionName, isSpectator } from './tableFactions';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/** The finished game's words for the phase chip: who won, as the Result window says it. */
export function resultTitle(table: TableProjection): string | undefined {
  const { result, stage } = table.snapshot;
  return stage === 'finished' && result
    ? describeResult(
        result.kind,
        result.factionIds.map((id) => factionName(table, id))
      )
    : undefined;
}

/** A finished game's one phase control, where Next phase sat: any player resumes it from Mentat Pause of this turn; plain, since it is no longer the table's main step. */
export function ContinuePlaying({ client, table }: Props) {
  if (table.playback || table.snapshot.stage !== 'finished' || !table.snapshot.result || !seated(table)) {
    return null;
  }
  return (
    <LabeledAction
      icon={<Play size={16} />}
      disabledReason={table.canInteract ? undefined : 'The table is unavailable.'}
      onClick={() => client.command({ kind: 'result-continue' })}
    >
      Continue playing
    </LabeledAction>
  );
}

function seated(table: TableProjection) {
  return !isSpectator(table);
}

/** Any seated player may open the sequence during Mentat Pause of play while nobody else has. */
function canDetermine(table: TableProjection) {
  const { stage, phase, phases, ending } = table.snapshot;
  const mentat = stage === 'play' && phaseAt(phase, phases).id === 'mentat-pause';
  return mentat && !ending && seated(table);
}

/** The plain Mentat Pause control that opens the end-of-game sequence for every player. */
export function DetermineWinner({ client, table }: Props) {
  if (table.playback || !canDetermine(table)) {
    return null;
  }
  return (
    <LabeledAction
      icon={<Trophy size={16} />}
      disabledReason={table.canInteract ? undefined : 'The table is unavailable.'}
      onClick={() => client.command({ kind: 'result-open' })}
    >
      Determine winner
    </LabeledAction>
  );
}
