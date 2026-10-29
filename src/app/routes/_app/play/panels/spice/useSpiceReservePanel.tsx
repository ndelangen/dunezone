import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { dropSpiceFromReserve, pickUpSpiceFromReserve } from '../../multiplayer/spiceReserveDrop';
import { SpiceReservePanel } from './SpiceReservePanel';
import type { SpiceReservePanelProps } from './SpiceReservePanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/** The Spice window from the table: the viewer's reserve, or nothing for a viewer without one. */
function useSpiceReservePanel({ client, table }: Props): SpiceReservePanelProps | null {
  const reserve = table.snapshot.bank;
  return reserve
    ? {
        balance: reserve.balance,
        enabled: table.canHandleTable,
        hiddenHeading: Boolean(table.snapshot.stage),
        onStartPlacement: (amount) => {
          if (client.getTable()?.canHandleTable) {
            pickUpSpiceFromReserve(amount);
          }
        },
        onWithdraw: (amount, point) =>
          Boolean(client.getTable()?.canHandleTable && dropSpiceFromReserve(amount, point)),
      }
    : null;
}

/** The Spice window's content at a live table. */
export function ConnectedSpiceReservePanel(props: Props) {
  const panel = useSpiceReservePanel(props);
  return panel && <SpiceReservePanel {...panel} />;
}
