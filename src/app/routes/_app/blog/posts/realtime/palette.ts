/*
 * The colours the post's figures share, so a seat looks the same from one figure to the next.
 * The seat colours are hand colours: brighter than the factions' own theme colours, which are made for a sheet rather than a line on a dark page.
 * The sand and ink values follow `@shared/uiPalette` and `@shared/play/assetColors`, copied rather than imported so the figures stay plain pictures.
 */

export type SeatId = 'atreides' | 'harkonnen' | 'fremen' | 'emperor' | 'spectator';

export const SEATS: Record<SeatId, { name: string; color: string; initial: string }> = {
  atreides: { name: 'Atreides', color: '#8fae3a', initial: 'A' },
  harkonnen: { name: 'Harkonnen', color: '#9c2727', initial: 'H' },
  fremen: { name: 'Fremen', color: '#d9b36a', initial: 'F' },
  emperor: { name: 'Emperor', color: '#e04a3f', initial: 'E' },
  spectator: { name: 'Spectator', color: '#9a9080', initial: 'S' },
};

export const INK = '#f0e8da';
export const MUTED = '#bfb09a';
export const SAND = '#d5ba8c';
export const SPICE = '#b8842f';
export const EDGE = '#887252';
export const GROUND = '#171511';
export const RECESS = '#211d18';
export const RAISED = '#352e25';

/** The pointer hand the table draws, in a 26 by 32 box; copied from the table's presence layer so the figures' hands match the real ones. */
export const HAND_PATH =
  'M6 18V4a2 2 0 0 1 4 0v10V11a2 2 0 0 1 4 0v4v-2a2 2 0 0 1 4 0v3v-1a2 2 0 0 1 4 0v8c0 3-2 6-5 7H9l-7-9c-2-3 1-5 3-3l3 3';
