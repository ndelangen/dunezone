import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { BidderSettings } from './BidderSettings';
import { LastTurnSettings } from './LastTurnSettings';

type Props = { client: TableSession; table: TableProjection };

/** The settings a table changes while it plays: the game's last turn, and the bidder's time while bidding. */
export function TableSettings({ client, table }: Props) {
  if (table.snapshot.stage !== 'play') {
    return null;
  }
  return (
    <>
      <BidderSettings client={client} table={table} />
      <LastTurnSettings client={client} table={table} />
    </>
  );
}
