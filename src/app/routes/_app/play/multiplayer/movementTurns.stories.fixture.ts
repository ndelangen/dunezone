import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { stormOrder } from '@shared/play/stormSector';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { playingSnapshot } from '../product.stories.fixture';

/* The turns read only the table's snapshot: its token faces and faction colours. */
const snapshot = playingSnapshot();
export const table = { snapshot } as TableProjection;
export const names = snapshotFactionLabels(snapshot);

/** The six factions at the table in the storm order they ship and move in, as the table starts the phase. */
export const order = stormOrder(snapshot.table.stormSectorIndex, snapshot.roster, snapshot.table.pieces);
