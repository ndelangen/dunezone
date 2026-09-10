import { GameTable } from './GameTable';
import type { TableSeatCount } from './tableSettings';
import { TabletopProvider } from './TabletopContext';
import './dune-play.css';

/** The local fixture has no connection, identity selection or persisted game data. */
export default function LocalTable({ seatCount }: Readonly<{ seatCount: TableSeatCount }>) {
  return (
    <TabletopProvider>
      <GameTable seatCount={seatCount} />
    </TabletopProvider>
  );
}
