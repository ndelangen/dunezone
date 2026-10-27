import { lastTurnOf } from '@shared/play/lastTurn';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { GameLengthPanel } from './GameLengthPanel';
import type { GameLengthPanelProps } from './GameLengthPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/** The game's last turn from the table, changeable by a seated player who may act. */
function useGameLengthPanel({ client, table }: Props): GameLengthPanelProps {
  return {
    lastTurn: lastTurnOf(table.snapshot),
    disabled: !table.canInteract || !table.snapshot.bank,
    onLastTurn: (turn) => void client.command({ kind: 'last-turn', turn }),
  };
}

/** The Settings window's content at a live table, while the game is in play. */
export function ConnectedGameLengthPanel(props: Props) {
  const panel = useGameLengthPanel(props);
  return props.table.snapshot.stage === 'play' ? <GameLengthPanel {...panel} /> : null;
}
