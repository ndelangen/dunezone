import type { TableProjection, TableSession } from '../../../db/tabletop/TableSession';
import { dropSpiceFromReserve, pickUpSpiceFromReserve } from '../../spice/spiceReserveDrop';
import { SpiceReservePanel } from './SpiceReservePanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/**
 * The Spice window's content at a live table: the viewer's reserve, or nothing for a viewer without one.
 * Its handlers read the live table when they run, so they stay the same for the table's life and the reserve skips the updates that leave its balance alone.
 */
export function ConnectedSpiceReservePanel({ client, table }: Props) {
  const reserve = table.snapshot.bank;
  const onStartPlacement = (amount: number) => {
    if (client.getTable()?.canHandleTable) {
      pickUpSpiceFromReserve(amount);
    }
  };
  const onWithdraw = (amount: number, point: Readonly<{ x: number; y: number }>) =>
    Boolean(client.getTable()?.canHandleTable && dropSpiceFromReserve(amount, point));
  return reserve ? (
    <SpiceReservePanel
      balance={reserve.balance}
      enabled={table.canHandleTable}
      hiddenHeading={Boolean(table.snapshot.stage)}
      onStartPlacement={onStartPlacement}
      onWithdraw={onWithdraw}
    />
  ) : null;
}
