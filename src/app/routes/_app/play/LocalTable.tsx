import type { ReactNode } from 'react';

import { GameTable } from './GameTable';
import type { TableSeatCount } from './tableSettings';
import { TabletopProvider } from './TabletopContext';
import './dune-play.css';

/** The local fixture has no connection, identity selection or persisted game data. */
export default function LocalTable({
  seatCount,
  onSeatCountChange,
  exitControl,
}: {
  seatCount: TableSeatCount;
  onSeatCountChange(next: TableSeatCount): void;
  exitControl: ReactNode;
}) {
  return (
    <TabletopProvider>
      <GameTable seatCount={seatCount} onSeatCountChange={onSeatCountChange} exitControl={exitControl} />
    </TabletopProvider>
  );
}
