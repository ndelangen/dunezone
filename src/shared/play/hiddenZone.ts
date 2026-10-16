import type { z } from 'zod';

import type { TablePiece } from './model';
import { HIDDEN_ZONE_SPOT_MAX } from './schema';
import type { hiddenZoneSpotSchema } from './schema';
import {
  CARD_DEPTH,
  CARD_WIDTH,
  MARKER_FOOTPRINT_RADIUS,
  TROOP_FOOTPRINT_RADIUS,
  tokenBoxRatio,
  troopScale,
} from './tableGeometry';

/**
 * A faction's hidden zone: a private, flat patch of table beside its hand, where the faction lays out what it holds.
 * Pieces keep their table size, so a token laid on a card covers the same share of it as it would on the table.
 */
export type HiddenZoneSpot = z.infer<typeof hiddenZoneSpotSchema>;

/**
 * The zone's standard patch in table units: about seven cards across and two deep.
 * Spots are fractions of it;
 * a tab roomier than the patch shows more of the zone past it, up to `HIDDEN_ZONE_SPOT_MAX` patches.
 */
export const HIDDEN_ZONE_WIDTH = 6.4;
export const HIDDEN_ZONE_DEPTH = 2.8;

/** The fewest pixels per table unit the zone draws at, so a card stays about 62px wide in a narrow column. */
export const HIDDEN_ZONE_MIN_SCALE = 72;

/** How much of the zone a view shows. */
export type HiddenZoneView = {
  /** Pixels per table unit: the standard patch fits where the view is large enough, without pieces shrinking below `HIDDEN_ZONE_MIN_SCALE`. */
  scale: number;
  /** How far the view reaches, in fractions of the standard patch. */
  extent: HiddenZoneSpot;
};

/** The zone a view of `width` by `height` pixels shows: the standard patch fitted in, and the room left over added to the zone. */
export function hiddenZoneView(width: number, height: number): HiddenZoneView {
  if (!(width > 0 && height > 0)) {
    return { scale: 0, extent: { x: 1, y: 1 } };
  }
  const scale = Math.max(HIDDEN_ZONE_MIN_SCALE, Math.min(width / HIDDEN_ZONE_WIDTH, height / HIDDEN_ZONE_DEPTH));
  const reach = (pixels: number, units: number) => Math.min(HIDDEN_ZONE_SPOT_MAX, pixels / scale / units);
  return { scale, extent: { x: reach(width, HIDDEN_ZONE_WIDTH), y: reach(height, HIDDEN_ZONE_DEPTH) } };
}

/** A piece's width and depth in the zone, in table units: its footprint on the table, at its token's physical size. */
export function hiddenZoneFootprint(piece: TablePiece): { width: number; depth: number } {
  if (piece.kind === 'card') {
    return { width: CARD_WIDTH, depth: CARD_DEPTH };
  }
  const standard = 2 * (piece.kind === 'marker' ? MARKER_FOOTPRINT_RADIUS : TROOP_FOOTPRINT_RADIUS * troopScale(piece));
  /* A token's author may make it smaller or larger than standard, such as a tiny marker for a tracker card. */
  const width = standard * (piece.items[0]?.artwork?.size ?? 1);
  return { width, depth: width * (tokenBoxRatio(piece) ?? 1) };
}

/** The pieces the zone holds, in drawing order: cards below tokens, and within each, the last one arranged on top. */
export function hiddenZonePieces(hand: readonly TablePiece[]): TablePiece[] {
  const laid = hand.filter((piece) => piece.hiddenZone);
  return [...laid.filter((piece) => piece.kind === 'card'), ...laid.filter((piece) => piece.kind !== 'card')];
}

/** Where a piece moved in from the inventory lands: a short cascade from the zone's left, so pieces moved in one after another stay apart. */
export function nextHiddenZoneSpot(hand: readonly TablePiece[]): HiddenZoneSpot {
  const count = hand.filter((piece) => piece.hiddenZone).length;
  return { x: 0.14 + (count % 7) * 0.12, y: 0.3 + (count % 3) * 0.2 };
}

/**
 * A spot kept inside the zone a view shows, so a piece dropped near an edge stays reachable, and a piece laid out in a roomier view is drawn at the edge of a smaller one.
 */
export function clampHiddenZoneSpot(spot: HiddenZoneSpot, extent: HiddenZoneSpot = { x: 1, y: 1 }): HiddenZoneSpot {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  return { x: clamp(spot.x, extent.x), y: clamp(spot.y, extent.y) };
}
