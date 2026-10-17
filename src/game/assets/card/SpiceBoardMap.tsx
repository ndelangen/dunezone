/* oxlint-disable jsx-a11y/alt-text -- Static decorative game-card layers, not content images. */
import type { CustomCardTokens, SpiceTint, SpiceTokenPlacement } from '@shared/assets/schema';
import { SPICE_BOARD_SIZE } from '@shared/assets/schema';
import { CENTER, RADIUS, derive } from '@shared/boards/geometry';
import type { Board, Face, Point } from '@shared/boards/geometry';
import { territoryId } from '@shared/boards/schema';
import { placeStickers } from '@shared/boards/stickerPlacement';
import { boardTerritoryAt } from '@shared/boards/territories';
import { offRim, offsetPath, outerSegments, outlinePaths } from '@shared/boards/tintOutline';
import { TINT_STICKER_ARTWORK, tintPaint } from '@shared/boards/tints';
import { useId, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { z } from 'zod';

import { BOARD_ARTWORK } from '../board/artwork';
import { BoardArtwork } from '../board/Board';
import { CardToken } from './CardToken';
import unique from './Spice.module.css';

type Tint = z.infer<typeof SpiceTint>;
type Placement = z.infer<typeof SpiceTokenPlacement>;
type Territory = { id: string; face: Face };
type ReadonlyPoint = readonly [number, number];

/* The table draws tints in table units over a board 3.98 wide; these are its sizes in board units, so a tint looks the same on a card as on the table. */
const TABLE_UNIT = RADIUS / 3.98;
const EDGE_WIDTH = 0.012 * TABLE_UNIT;
const DOUBLE_LINE_WIDTH = 0.012 * TABLE_UNIT;
const DOUBLE_LINE_GAP = 0.012 * TABLE_UNIT;
const STICKER_LARGEST = 0.3 * TABLE_UNIT;
const STICKER_SMALLEST = 0.14 * TABLE_UNIT;
const STICKER_INK = '#1a0b00';
const STICKER_OUTLINE = '#fffed8';

export function boardTerritoryList(board: Board): Territory[] {
  return derive(board).faces.map((face) => ({ id: territoryId(board.properties[face.key].name), face }));
}

/** The board's territories a tint covers: those it names, and every current one of a type it names. */
export function tintTerritories(board: Board, territories: readonly Territory[], tint: Tint) {
  const named = new Set(tint.territories);
  const types = new Set<string>(tint.types ?? []);
  return territories.filter(({ id, face }) => named.has(id) || types.has(board.properties[face.key].type));
}

/** Territory IDs the card keeps that the linked board does not have; they stay stored and only drop out of the drawing. */
export function missingTintTerritories(board: Board, tints: readonly Tint[]) {
  const known = new Set(Object.values(board.properties).map((property) => territoryId(property.name)));
  return [...new Set(tints.flatMap((tint) => tint.territories))].filter((id) => !known.has(id));
}

const segmentPath = (segments: readonly (readonly [ReadonlyPoint, ReadonlyPoint])[]) =>
  segments.map(([a, b]) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`).join('');

const polygon = (points: readonly ReadonlyPoint[]) => `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`;

/** One double line round the tint's territories taken together, the borders between them and the rim left out. */
function TintOutline({ territories, color }: { territories: Territory[]; color: string }) {
  const half = DOUBLE_LINE_GAP / 2;
  const segments = offRim(outerSegments(territories.map(({ face }) => face.rings)), CENTER, RADIUS);
  const d = outlinePaths(segments)
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
  return <path d={d} fill={color} fillRule="nonzero" />;
}

function Stickers({ tint, territory, filter }: { tint: Tint; territory: Territory; filter: string }) {
  const stamps = tint.stamps ?? [];
  if (!stamps.length) {
    return null;
  }
  const { at, size: fitted } = placeStickers(territory.face.rings, stamps.length, STICKER_LARGEST);
  const size = Math.max(STICKER_SMALLEST, fitted);
  return stamps.map((stamp, index) => {
    const [x, y] = at[index] ?? territory.face.center;
    return (
      <image
        key={stamp}
        data-tint-sticker={stamp}
        href={TINT_STICKER_ARTWORK[stamp]}
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        filter={`url(#${filter})`}
      />
    );
  });
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

/** A tint as the table draws it: a see-through fill with a line of its colour, or one double line round its territories, with stickers either way. */
function TintLayer({
  tint,
  territories,
  stickerFilter,
}: {
  tint: Tint;
  territories: Territory[];
  stickerFilter: string;
}) {
  const paint = tintPaint(tint.color);
  return (
    <g data-tint={tint.id}>
      {tint.outline ? (
        <TintOutline territories={territories} color={paint.color} />
      ) : (
        territories.map(({ id, face }) => (
          <g key={id}>
            <path d={face.path} fill={paint.color} fillOpacity={paint.opacity} fillRule="evenodd" />
            <path d={edgePath(face)} fill="none" stroke={paint.color} strokeOpacity={0.95} strokeWidth={EDGE_WIDTH} />
          </g>
        ))
      )}
      {territories.map((territory) => (
        <Stickers key={territory.id} tint={tint} territory={territory} filter={stickerFilter} />
      ))}
    </g>
  );
}

function PlacedToken({
  token,
  asset,
  selected,
}: {
  token: Placement;
  asset: NonNullable<z.infer<typeof CustomCardTokens>[string]>;
  selected: boolean;
}) {
  const percent = (value: number) => `${(value / SPICE_BOARD_SIZE) * 100}%`;
  return (
    <div
      className={unique.mapToken}
      data-token-instance={token.layerId}
      data-selected={selected ? '' : undefined}
      style={{
        left: percent(token.x),
        top: percent(token.y),
        width: percent(token.size),
        height: percent((token.size * (asset.type === 'token-enhance' ? 186 : 300)) / 300),
        transform: `translate(-50%, -50%) rotate(${token.rotation}deg)`,
      }}
    >
      <CardToken token={asset} />
    </div>
  );
}

/**
 * What an editor does with the card's map: a brush that adds or removes the territory clicked, and tokens dragged into place.
 * Only the editor's live proof passes it;
 * a published card draws nothing interactive.
 */
export type SpiceMapEditing = {
  /** Set while a tint's brush is on: called with the territory ID under the click. */
  onTerritory?: (territory: string) => void;
  onTokenMove?: (layerId: string, x: number, y: number) => void;
  /** The placed token the editor has open, drawn with a ring. */
  selectedToken?: string | null;
  onSelectToken?: (layerId: string) => void;
};

const clampBoard = (value: number) => Math.min(SPICE_BOARD_SIZE, Math.max(0, Math.round(value * 10) / 10));

/** A surface over the whole map that turns pointer input into board coordinates: a drag on a token moves it, a click elsewhere paints. */
function EditSurface({
  board,
  tokens,
  editing,
}: {
  board: Board;
  tokens: readonly Placement[];
  editing: SpiceMapEditing;
}) {
  const drag = useRef<{ layerId: string; dx: number; dy: number; pointerId: number } | null>(null);
  const toBoard = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * SPICE_BOARD_SIZE,
      ((event.clientY - rect.top) / rect.height) * SPICE_BOARD_SIZE,
    ];
  };
  /* The topmost token under the point, the last drawn first. */
  const tokenAt = ([x, y]: [number, number]) =>
    editing.onTokenMove
      ? tokens.findLast((token) => Math.hypot(token.x - x, token.y - y) <= token.size / 2)
      : undefined;
  return (
    <div
      className={unique.mapEdit}
      data-brush={editing.onTerritory ? '' : undefined}
      onPointerDown={(event) => {
        const point = toBoard(event);
        const token = tokenAt(point);
        if (token) {
          /* Capture keeps the drag when the pointer outruns the map; a synthetic pointer has nothing to capture. */
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* The drag still follows moves over the map. */
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
        if (editing.onTerritory) {
          const property = boardTerritoryAt(board, point);
          if (property) {
            editing.onTerritory(territoryId(property.name));
          }
        }
      }}
      onPointerMove={(event) => {
        const held = drag.current;
        if (held?.pointerId === event.pointerId) {
          const [x, y] = toBoard(event);
          editing.onTokenMove?.(held.layerId, clampBoard(x + held.dx), clampBoard(y + held.dy));
        }
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}

/** A Spice card's map drawn from its linked board: the board's own artwork, its tints oldest first, then its placed tokens. */
export function SpiceBoardMap({
  board,
  tints,
  tokens = [],
  tokenAssets = {},
  editing,
}: {
  board: Board;
  tints: readonly Tint[];
  tokens?: readonly Placement[];
  tokenAssets?: z.infer<typeof CustomCardTokens>;
  editing?: SpiceMapEditing;
}) {
  const stickerFilter = `${useId().replaceAll(':', '')}-sticker`;
  const territories = boardTerritoryList(board);
  const viewBox = `0 0 ${SPICE_BOARD_SIZE} ${SPICE_BOARD_SIZE}`;

  return (
    <>
      <svg className={unique.map} viewBox={viewBox} fillRule="evenodd" clipRule="evenodd">
        <BoardArtwork board={board} faces={territories.map(({ face }) => face)} artwork={BOARD_ARTWORK} />
      </svg>
      <svg className={unique.map_overlay} viewBox={viewBox} fillRule="evenodd" clipRule="evenodd">
        <defs>
          {/* The board's glyph colours: near-black ink inside a pale outline. */}
          <filter id={stickerFilter} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
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
        {tints.map((tint) => (
          <TintLayer
            key={tint.id}
            tint={tint}
            territories={tintTerritories(board, territories, tint)}
            stickerFilter={stickerFilter}
          />
        ))}
      </svg>
      <div className={unique.mapTokens}>
        {tokens.map((token) => {
          const asset = tokenAssets[token.asset_id];
          return asset ? (
            <PlacedToken
              key={token.layerId}
              token={token}
              asset={asset}
              selected={editing?.selectedToken === token.layerId}
            />
          ) : null;
        })}
      </div>
      {editing ? <EditSurface board={board} tokens={tokens} editing={editing} /> : null}
    </>
  );
}
