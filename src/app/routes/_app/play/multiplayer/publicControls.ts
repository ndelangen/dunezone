import { emptyPublicControls } from '@shared/play/inventory';
import type { PublicControls } from '@shared/play/inventory';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/** The table's public seats, players and requests, or none yet before the room has sent them. */
export function publicControlsOf(table: TableProjection): PublicControls {
  return table.snapshot.controls ?? emptyPublicControls();
}
