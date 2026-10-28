import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/** Whether the viewer watches the table rather than holding a seat at it. */
export function isSpectator(table: TableProjection): boolean {
  return table.viewer.viewerSeat === SPECTATOR_SEAT;
}

/** Whether the viewer is offered table actions: a seated viewer at the live table. A past table takes none, so none are offered, not even greyed. */
export function offersActions(table: TableProjection): boolean {
  return !isSpectator(table) && !table.playback;
}

/** The faction a seat carries, if it carries one. */
export function seatFaction(table: TableProjection, seat: string): string | undefined {
  return rosterSeat(table.snapshot.roster, seat)?.faction?.id;
}

/** The faction the viewer's seat carries, if it carries one. */
export function viewerFaction(table: TableProjection): string | undefined {
  return seatFaction(table, table.viewer.viewerSeat);
}

/** The faction the viewer acts for at the live table; none while a past table shows. */
export function actingFaction(table: TableProjection): string | undefined {
  return table.playback ? undefined : viewerFaction(table);
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
