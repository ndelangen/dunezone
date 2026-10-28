import { snapshotFactionLabels } from '@shared/play/factionLabels';

import type { TableProjection } from '../../../../../db/tabletop/TableSession';
import { BattleHistoryPanel } from './BattleHistoryPanel';

/** The Battles window's content at a live table: the agreed results the snapshot carries. */
export function ConnectedBattleHistoryPanel({ table }: Readonly<{ table: TableProjection }>) {
  return (
    <BattleHistoryPanel
      results={table.snapshot.battleResults ?? []}
      artwork={table.snapshot.factionArtwork}
      names={snapshotFactionLabels(table.snapshot)}
    />
  );
}
