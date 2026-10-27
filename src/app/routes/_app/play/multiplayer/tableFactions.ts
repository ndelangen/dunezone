import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/** Whether the viewer watches the table rather than holding a seat at it. */
export function isSpectator(table: TableProjection): boolean {
  return table.viewer.viewerSeat === SPECTATOR_SEAT;
}

/** A replay is watched as a spectator watches the table: a past table takes no actions, so none are offered, not even greyed. */
export function watchedTable(table: TableProjection): TableProjection {
  return table.playback ? { ...table, viewer: { ...table.viewer, viewerSeat: SPECTATOR_SEAT } } : table;
}

/** The faction a seat carries, if it carries one. */
export function seatFaction(table: TableProjection, seat: string): string | undefined {
  return rosterSeat(table.snapshot.roster, seat)?.faction?.id;
}

/** The faction the viewer's seat carries, if it carries one. */
export function viewerFaction(table: TableProjection): string | undefined {
  return seatFaction(table, table.viewer.viewerSeat);
}

/** A faction's name at this table, or its id when the table has no label for it. */
export function factionName(table: TableProjection, id: string): string {
  return snapshotFactionLabels(table.snapshot)[id] ?? id;
}

/** The table's factions as select options. */
export function factionOptions(table: TableProjection) {
  return Object.entries(snapshotFactionLabels(table.snapshot)).map(([value, label]) => ({ value, label }));
}

/** Whether a stage plays like a game in play: a hosted game in play, or the fixture, which has no stage. */
export function stageInPlay(stage: string | undefined): boolean {
  return stage === undefined || stage === 'play';
}
