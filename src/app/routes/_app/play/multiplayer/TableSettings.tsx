import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { LastTurnSettings } from './LastTurnSettings';

type Props = { client: TableSession; table: TableProjection };

/** The game's last turn, changed beside the phase controls. */
export function TableSettings({ client, table }: Props) {
  if (table.snapshot.stage !== 'play') {
    return null;
  }
  return (
    <>
      <LastTurnSettings client={client} table={table} />
    </>
  );
}
