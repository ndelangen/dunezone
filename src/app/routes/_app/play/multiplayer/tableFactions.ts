import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterSeat } from '@shared/play/schema';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/** The faction the viewer's seat carries, if it carries one. */
export function viewerFaction(table: TableProjection): string | undefined {
  return rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
}

/** A faction's name at this table, or its id when the table has no label for it. */
export function factionName(table: TableProjection, id: string): string {
  return snapshotFactionLabels(table.snapshot)[id] ?? id;
}

/** The table's factions as select options. */
export function factionOptions(table: TableProjection) {
  return Object.entries(snapshotFactionLabels(table.snapshot)).map(([value, label]) => ({ value, label }));
}
