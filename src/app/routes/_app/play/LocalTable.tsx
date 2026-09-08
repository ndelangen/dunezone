import { GameTable } from './GameTable';
import type { TableSeatCount } from './tableSettings';
import { TabletopProvider } from './TabletopContext';
import './dune-play.css';

/** The local fixture has no connection, identity selection or persisted game data. */
export default function LocalTable({
  seatCount,
  onSeatCountChange,
}: {
  seatCount: TableSeatCount;
  onSeatCountChange(next: TableSeatCount): void;
}) {
  return (
    <TabletopProvider>
      <GameTable seatCount={seatCount} onSeatCountChange={onSeatCountChange} />
    </TabletopProvider>
  );
}
