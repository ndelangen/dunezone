import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { ReplayPanel } from './ReplayPanel';
import type { ReplayPanelProps, ReplayState } from './ReplayPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/** Where the table stands in its saved phases; a hosted game browses from its header, a fixture table from the panel. */
export function replayState(table: TableProjection): ReplayState {
  const { playback } = table;
  if (playback && table.snapshot.stage) {
    return { kind: 'header' };
  }
  return playback
    ? { kind: 'browsing', step: playback.step, lastStep: playback.lastStep }
    : { kind: 'live', canStart: !table.state.draftMove && !table.reconnecting };
}

/** The Replay window from the table: where it stands, and the reads that step through the saved phases. */
export function useReplayPanel({ client, table }: Props): ReplayPanelProps {
  return {
    replay: replayState(table),
    pending: table.historyPending,
    onStep: (step) => client.requestHistory(step),
    onLive: client.resumeLive,
  };
}

/** The Replay window's content at a live table. */
export function ConnectedReplayPanel(props: Props) {
  return <ReplayPanel {...useReplayPanel(props)} />;
}
