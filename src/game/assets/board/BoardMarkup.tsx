/* oxlint-disable jsx-a11y/alt-text -- Static decorative board layers, not content images. */
import { POINTER_TIP_RATIO, tokenShapeAspect, tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { TokenShape } from '@shared/assets/tokenOutline';
import type { Board } from '@shared/boards/geometry';
import { BOARD_FRAME_SIZE } from '@shared/boards/markup';
import type { BoardTokenPlacement } from '@shared/boards/markup';
import { territoryId } from '@shared/boards/schema';
import { boardTerritoryAt } from '@shared/boards/territories';
import { TINT_EDGE_WIDTH } from '@shared/boards/tintDrawing';
import type { TintDrawing } from '@shared/boards/tintDrawing';
import { TINT_STICKER_ARTWORK } from '@shared/boards/tints';
import { useRef } from 'react';
import type { PointerEvent } from 'react';

/*
 * Board markup as Spice cards and Rulebook board scenes both draw and edit it: tints over the board, token assets placed on it.
 * Everything here works in the board's own frame, BOARD_FRAME_SIZE units square.
 */

const STICKER_INK = '#1a0b00';
const STICKER_OUTLINE = '#fffed8';

/**
 * Tints in board units, oldest first, for an SVG whose user space is the board's frame.
 * `filterId` names the sticker filter this draws, unique on the page.
 */
export function TintDrawingLayers({
  drawings,
  filterId,
}: Readonly<{ drawings: readonly TintDrawing[]; filterId: string }>) {
  return (
    <>
      <defs>
        {/* The board's glyph colours: near-black ink inside a pale outline. */}
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={1} result="WIDE" />
          <feFlood floodColor={STICKER_OUTLINE} result="PALE" />
          <feComposite in="PALE" in2="WIDE" operator="in" result="OUTLINE" />
          <feFlood floodColor={STICKER_INK} result="DARK" />
          <feComposite in="DARK" in2="SourceAlpha" operator="in" result="INK" />
          <feMerge>
            <feMergeNode in="OUTLINE" />
            <feMergeNode in="INK" />
          </feMerge>
        </filter>
      </defs>
      {drawings.map((drawing) => (
        <g key={drawing.id} data-tint={drawing.id}>
          {drawing.outline !== undefined ? (
            <path
              d={drawing.outline}
              fill={drawing.color}
              fillOpacity={drawing.outlineOpacity ?? 1}
              fillRule="nonzero"
            />
          ) : (
            drawing.fills.map((fill, index) => (
              <g key={index}>
                <path d={fill.d} fill={drawing.color} fillOpacity={drawing.opacity} fillRule="evenodd" />
                <path
                  d={fill.edge}
                  fill="none"
                  stroke={drawing.color}
                  strokeOpacity={0.95}
                  strokeWidth={TINT_EDGE_WIDTH}
                />
              </g>
            ))
          )}
          {drawing.stickers.map((sticker, index) => (
            <image
              key={index}
              data-tint-sticker={sticker.stamp}
              href={TINT_STICKER_ARTWORK[sticker.stamp]}
              x={sticker.x - sticker.size / 2}
              y={sticker.y - sticker.size / 2}
              width={sticker.size}
              height={sticker.size}
              filter={`url(#${filterId})`}
            />
          ))}
        </g>
      ))}
    </>
  );
}

/** How tall a placed token draws, from its width and the shape its asset type cuts. */
export const placedTokenHeight = (token: BoardTokenPlacement, type: string | undefined) =>
  token.size * tokenShapeAspect(tokenShapeOfType(type) ?? 'square');

/* A pointer's round end, as a fraction of its square face: the point at the top centre, the round end filling the bottom. */
const POINTER_RADIUS = 1 / (1 + POINTER_TIP_RATIO);
const POINTER_CENTRE = 1 - POINTER_RADIUS;

/** Whether a point in a pointer's square face, from 0 to 1, falls in its teardrop. */
function insidePointer(u: number, v: number) {
  if (Math.hypot(u - 0.5, v - POINTER_CENTRE) <= POINTER_RADIUS) {
    return true;
  }
  /* Above the round end the teardrop narrows straight to its point along the tangent lines. */
  const tangent = Math.acos(1 / POINTER_TIP_RATIO);
  const edgeY = POINTER_CENTRE - POINTER_RADIUS * Math.cos(tangent);
  return v <= edgeY && Math.abs(u - 0.5) <= (v / edgeY) * POINTER_RADIUS * Math.sin(tangent);
}

const SHAPE_HITS: Record<TokenShape, (u: number, v: number) => boolean> = {
  round: (u, v) => Math.hypot(u - 0.5, v - 0.5) <= 0.5,
  gear: (u, v) => Math.hypot(u - 0.5, v - 0.5) <= 0.5,
  pointer: insidePointer,
  square: () => true,
  rectangle: () => true,
};

const withinFace = (value: number) => value >= 0 && value <= 1;

/** Whether a point in a token's face, from 0 to 1 across and down, falls inside the shape it is cut to. */
const insideTokenShape = (shape: TokenShape, u: number, v: number) =>
  withinFace(u) && withinFace(v) && SHAPE_HITS[shape](u, v);

/**
 * The topmost drawn token under the point, the last drawn first, hit on its own rotated and cut shape.
 * `typeOf` gives a placed asset's type, undefined for one that is not drawn.
 */
export function topTokenAt(
  tokens: readonly BoardTokenPlacement[],
  typeOf: (assetId: string) => string | undefined,
  [x, y]: readonly [number, number]
) {
  return tokens.findLast((token) => {
    const type = typeOf(token.asset_id);
    if (type === undefined) {
      return false;
    }
    const turn = (-token.rotation * Math.PI) / 180;
    const dx = x - token.x;
    const dy = y - token.y;
    const along = dx * Math.cos(turn) - dy * Math.sin(turn);
    const across = dx * Math.sin(turn) + dy * Math.cos(turn);
    return insideTokenShape(
      tokenShapeOfType(type) ?? 'square',
      along / token.size + 0.5,
      across / placedTokenHeight(token, type) + 0.5
    );
  });
}

/**
 * What an editor does with board markup: a brush that adds or removes the territory clicked, and tokens dragged into place.
 * Only an editor's live preview passes it;
 * published output draws nothing interactive.
 */
export type BoardMarkupEditing = {
  /** Set while a tint's brush is on: called with the territory ID under the click. */
  onTerritory?: (territory: string) => void;
  onTokenMove?: (layerId: string, x: number, y: number) => void;
  /** The placed token the editor has open, drawn with a ring. */
  selectedToken?: string | null;
  onSelectToken?: (layerId: string) => void;
};

const clampBoard = (value: number) => Math.min(BOARD_FRAME_SIZE, Math.max(0, Math.round(value * 10) / 10));

/**
 * Pointer handlers for a surface over the board that turns input into board coordinates: a drag on a token moves it, a click elsewhere paints.
 * `toBoard` maps a pointer event to the board's frame, so any surface, an HTML layer or an SVG shape, can carry them.
 */
export function useBoardMarkupPointer<Element extends HTMLElement | SVGElement>({
  board,
  tokens,
  typeOf,
  editing,
  toBoard,
}: {
  board: Board;
  tokens: readonly BoardTokenPlacement[];
  typeOf: (assetId: string) => string | undefined;
  editing: BoardMarkupEditing;
  toBoard: (event: PointerEvent<Element>) => [number, number];
}) {
  const drag = useRef<{ layerId: string; dx: number; dy: number; pointerId: number } | null>(null);
  const release = () => {
    drag.current = null;
  };
  return {
    onPointerDown: (event: PointerEvent<Element>) => {
      const point = toBoard(event);
      const token = editing.onTokenMove ? topTokenAt(tokens, typeOf, point) : undefined;
      if (token) {
        /* Capture keeps the drag when the pointer outruns the board; a synthetic pointer has nothing to capture. */
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* The drag still follows moves over the board. */
        }
        drag.current = {
          layerId: token.layerId,
          dx: token.x - point[0],
          dy: token.y - point[1],
          pointerId: event.pointerId,
        };
        editing.onSelectToken?.(token.layerId);
        return;
      }
      const property = editing.onTerritory ? boardTerritoryAt(board, point) : undefined;
      if (property) {
        editing.onTerritory?.(territoryId(property.name));
      }
    },
    onPointerMove: (event: PointerEvent<Element>) => {
      const held = drag.current;
      if (held?.pointerId === event.pointerId) {
        const [x, y] = toBoard(event);
        editing.onTokenMove?.(held.layerId, clampBoard(x + held.dx), clampBoard(y + held.dy));
      }
    },
    onPointerUp: release,
    onPointerCancel: release,
  };
}
