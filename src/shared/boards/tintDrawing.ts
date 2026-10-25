import { z } from 'zod';

import { CENTER, RADIUS, derive } from './geometry';
import type { Board, Face, Point } from './geometry';
import type { BoardTint } from './markup';
import { propertyId } from './schema';
import { placeStickers } from './stickerPlacement';
import { offRim, offsetPath, outerSegments, outlinePaths } from './tintOutline';
import { TINT_STAMPS, tintOutlineOpacity, tintPaint } from './tints';

/*
 * What a tint draws on a saved board, worked out once from the board and kept as plain SVG paths and positions.
 * A Spice card works it out as it draws; a Rulebook works it out when it projects a scene, so a published scene needs only the drawing and never the whole board.
 */

export type BoardTerritory = { id: string; face: Face };
type ReadonlyPoint = readonly [number, number];

/* The table draws tints in table units over a board 3.98 wide; these are its sizes in board units, so a tint's fill and stickers look the same off the table as on it. Cards and pages are read small, so the outline is drawn much heavier than the table's. */
const TABLE_UNIT = RADIUS / 3.98;
/** The width of the line a filled tint draws along its territories' edges, in board units. */
export const TINT_EDGE_WIDTH = 0.012 * TABLE_UNIT;
const DOUBLE_LINE_WIDTH = 0.1 * TABLE_UNIT;
const DOUBLE_LINE_GAP = 0.05 * TABLE_UNIT;
const STICKER_LARGEST = 0.3 * TABLE_UNIT;
const STICKER_SMALLEST = 0.14 * TABLE_UNIT;

const coordinate = z.number();
export const tintDrawingSchema = z.strictObject({
  id: z.string(),
  color: z.string(),
  opacity: z.number().min(0).max(1),
  /** One entry per territory, up to the 512 a board may hold: its area, and its own line without the stretch along the board's rim. */
  fills: z.array(z.strictObject({ d: z.string(), edge: z.string() })).max(512),
  /** Set for an outline-only tint: one double line round its territories taken together. */
  outline: z.string().optional(),
  /** How opaque the outline is; a drawing without one predates outline opacity and draws it solid. */
  outlineOpacity: z.number().min(0).max(1).optional(),
  stickers: z.array(z.strictObject({ stamp: z.enum(TINT_STAMPS), x: coordinate, y: coordinate, size: coordinate })),
});
export type TintDrawing = z.infer<typeof tintDrawingSchema>;

/* Deriving a board's faces takes tens of milliseconds and editors redraw on every token drag step, so faces are kept per board object. */
const territoryCache = new WeakMap<Board, BoardTerritory[]>();

/** A saved board's territories under the IDs tints name them by. */
export function boardTerritoryList(board: Board): BoardTerritory[] {
  let territories = territoryCache.get(board);
  if (!territories) {
    territories = derive(board).faces.map((face) => ({ id: propertyId(board.properties[face.key]), face }));
    territoryCache.set(board, territories);
  }
  return territories;
}

/** The board's territories a tint covers: those it names, and every current one of a type it names. */
function tintTerritories(board: Board, tint: BoardTint) {
  const named = new Set(tint.territories);
  const types = new Set<string>(tint.types ?? []);
  return boardTerritoryList(board).filter(
    ({ id, face }) => named.has(id) || types.has(board.properties[face.key].type)
  );
}

/** Territory IDs the markup keeps that the board does not have; they stay stored and only drop out of the drawing. */
export function missingTintTerritories(board: Board, tints: readonly BoardTint[]) {
  const known = new Set(Object.values(board.properties).map((property) => propertyId(property)));
  return [...new Set(tints.flatMap((tint) => tint.territories))].filter((id) => !known.has(id));
}

/** Each territory ID on the board with the name its author gave it. */
export function boardTerritoryNames(board: Board | null | undefined): ReadonlyMap<string, string> {
  return new Map(Object.values(board?.properties ?? {}).map((property) => [propertyId(property), property.name]));
}

/* Two decimals of a board unit is far below a pixel at any size a page or card is drawn, and halves what a stored drawing weighs. */
const round = (value: number) => Math.round(value * 100) / 100;
const roundPath = (d: string) => d.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (value) => String(round(Number(value))));

const segmentPath = (segments: readonly (readonly [ReadonlyPoint, ReadonlyPoint])[]) =>
  segments.map(([a, b]) => `M${round(a[0])} ${round(a[1])}L${round(b[0])} ${round(b[1])}`).join('');

const polygon = (points: readonly ReadonlyPoint[]) =>
  `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;

/** One double line round the territories taken together, the borders between them and the rim left out. */
function outlinePath(territories: readonly BoardTerritory[]) {
  const half = DOUBLE_LINE_GAP / 2;
  const segments = offRim(outerSegments(territories.map(({ face }) => face.rings)), CENTER, RADIUS);
  return outlinePaths(segments)
    .flatMap((path) =>
      [
        [half, half + DOUBLE_LINE_WIDTH],
        [-half, -half - DOUBLE_LINE_WIDTH],
      ].flatMap(([near, far]) => {
        const inner = offsetPath(path, near);
        const outer = offsetPath(path, far);
        const corners = path.closed ? inner.length : inner.length - 1;
        return Array.from({ length: corners }, (_, i) => {
          const j = (i + 1) % inner.length;
          return polygon([inner[i], outer[i], outer[j], inner[j]]);
        });
      })
    )
    .join('');
}

/** A territory's own line, without the stretch along the board's rim. */
function edgePath(face: Face) {
  return segmentPath(
    offRim(
      face.rings.flatMap((ring) => ring.slice(1).map((to, i): [Point, Point] => [ring[i], to])),
      CENTER,
      RADIUS
    )
  );
}

function stickers(tint: BoardTint, territory: BoardTerritory): TintDrawing['stickers'] {
  const stamps = tint.stamps ?? [];
  if (!stamps.length) {
    return [];
  }
  const { at, size: fitted } = placeStickers(territory.face.rings, stamps.length, STICKER_LARGEST);
  const size = round(Math.max(STICKER_SMALLEST, fitted));
  return stamps.map((stamp, index) => {
    const [x, y] = at[index] ?? territory.face.center;
    return { stamp, x: round(x), y: round(y), size };
  });
}

/* Editors re-project and redraw on every change; a tint that did not change keeps its drawing. */
const drawingCache = new WeakMap<Board, WeakMap<BoardTint, TintDrawing>>();

/** A tint as the table draws it: a see-through fill with a line of its colour, or one double line round its territories, with stickers either way. */
export function tintDrawing(board: Board, tint: BoardTint): TintDrawing {
  let drawings = drawingCache.get(board);
  if (!drawings) {
    drawings = new WeakMap();
    drawingCache.set(board, drawings);
  }
  let drawing = drawings.get(tint);
  if (!drawing) {
    drawing = drawTint(board, tint);
    drawings.set(tint, drawing);
  }
  return drawing;
}

function drawTint(board: Board, tint: BoardTint): TintDrawing {
  const territories = tintTerritories(board, tint);
  const paint = tintPaint(tint.color);
  return {
    id: tint.id,
    color: paint.color,
    opacity: paint.opacity,
    fills: tint.outline ? [] : territories.map(({ face }) => ({ d: roundPath(face.path), edge: edgePath(face) })),
    ...(tint.outline ? { outline: outlinePath(territories), outlineOpacity: tintOutlineOpacity(tint.color) } : {}),
    stickers: territories.flatMap((territory) => stickers(tint, territory)),
  };
}
