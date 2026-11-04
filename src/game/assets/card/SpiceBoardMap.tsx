/* oxlint-disable jsx-a11y/alt-text -- Static decorative game-card layers, not content images. */
import type { CustomCardTokens, SpiceBoardLook } from '@shared/assets/schema';
import { SPICE_BOARD_SIZE } from '@shared/assets/schema';
import type { Board } from '@shared/boards/geometry';
import { CENTER, sectorRim } from '@shared/boards/geometry';
import type { BoardTint, BoardTokenPlacement } from '@shared/boards/markup';
import { boardTerritoryList, tintDrawing } from '@shared/boards/tintDrawing';
import type { TintDrawing } from '@shared/boards/tintDrawing';
import { TINT_STICKER_ARTWORK, tintOutlineOpacity } from '@shared/boards/tints';
import { TABLE_SECTOR_COUNT } from '@shared/play/tableSettings';
import { useId, useMemo } from 'react';
import type { PointerEvent } from 'react';
import type { z } from 'zod';

import { BOARD_ARTWORK } from '../board/artwork';
import { BoardArtwork } from '../board/Board';
import { placedTokenHeight, useBoardMarkupPointer } from '../board/BoardMarkup';
import type { BoardMarkupEditing } from '../board/BoardMarkup';
import { GlyphOutlineFilter } from '../board/glyphOutline';
import { CardToken } from './CardToken';
import unique from './Spice.module.css';

type Placement = BoardTokenPlacement;
type Look = z.infer<typeof SpiceBoardLook>;

/* A card without a look burns its board into the parchment as fully as the classic map is. */
const DEFAULT_LOOK: Look = { style: 'burnt', strength: 1 };

type TokenAssets = z.infer<typeof CustomCardTokens>;

function PlacedToken({
  token,
  asset,
  selected,
}: {
  token: Placement;
  asset: NonNullable<TokenAssets[string]>;
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
        height: percent(placedTokenHeight(token, asset.type)),
        transform: `translate(-50%, -50%) rotate(${token.rotation}deg)`,
      }}
    >
      <CardToken token={asset} />
    </div>
  );
}

/* The classic card highlight, in board units: a fill in the tint's colour, ringed in black and then in parchment. */
const HIGHLIGHT_EDGE_COLOR = '#000';
const HIGHLIGHT_HALO_COLOR = '#F8F6E2';
const HIGHLIGHT_HALO_RADIUS = 5;
const HIGHLIGHT_EDGE_RADIUS = 3;
const HIGHLIGHT_FILL_RADIUS = 1;

/**
 * A card's tints as the classic map drew its highlights: the territories filled, ringed black then parchment;
 * an outline-only tint keeps its outline.
 * The rings are always solid.
 * The fill takes the colour's own see-through amount when it carries one, else it is solid, as the classic map was.
 */
function CardTintLayers({
  drawings,
  opacities,
  idPrefix,
}: Readonly<{ drawings: readonly TintDrawing[]; opacities: readonly number[]; idPrefix: string }>) {
  const stickerFilter = `${idPrefix}-sticker`;
  return (
    <>
      <defs>
        <GlyphOutlineFilter id={stickerFilter} recolor />
        {drawings.map((drawing, index) => (
          <filter
            key={drawing.id}
            id={`${idPrefix}-highlight-${index}`}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={SPICE_BOARD_SIZE}
            height={SPICE_BOARD_SIZE}
          >
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 34 0"
              result="shape"
            />
            <feMorphology in="shape" operator="dilate" radius={HIGHLIGHT_HALO_RADIUS} result="halo" />
            <feMorphology in="shape" operator="dilate" radius={HIGHLIGHT_EDGE_RADIUS} result="edge" />
            <feMorphology in="shape" operator="dilate" radius={HIGHLIGHT_FILL_RADIUS} result="fill" />
            {/* Each ring is only its band, so a see-through fill shows the board, not the rings, beneath it. */}
            <feComposite in="halo" in2="edge" operator="out" result="haloBand" />
            <feComposite in="edge" in2="fill" operator="out" result="edgeBand" />
            <feFlood floodColor={HIGHLIGHT_HALO_COLOR} result="haloColor" />
            <feComposite in="haloColor" in2="haloBand" operator="in" result="haloRing" />
            <feFlood floodColor={HIGHLIGHT_EDGE_COLOR} result="edgeColor" />
            <feComposite in="edgeColor" in2="edgeBand" operator="in" result="edgeRing" />
            <feFlood floodColor={drawing.color} floodOpacity={opacities[index]} result="fillColor" />
            <feComposite in="fillColor" in2="fill" operator="in" result="fillArea" />
            <feMerge>
              <feMergeNode in="haloRing" />
              <feMergeNode in="edgeRing" />
              <feMergeNode in="fillArea" />
            </feMerge>
          </filter>
        ))}
      </defs>
      {drawings.map((drawing, index) => (
        <g key={drawing.id} data-tint={drawing.id}>
          {drawing.outline !== undefined ? (
            <path
              d={drawing.outline}
              fill={drawing.color}
              fillOpacity={drawing.outlineOpacity ?? 1}
              fillRule="nonzero"
            />
          ) : (
            <g filter={`url(#${idPrefix}-highlight-${index})`}>
              {drawing.fills.map((fill, fillIndex) => (
                <path key={fillIndex} data-tint-fill d={fill.d} fill="#000" fillRule="evenodd" />
              ))}
            </g>
          )}
          {drawing.stickers.map((sticker, stickerIndex) => (
            <image
              key={stickerIndex}
              data-tint-sticker={sticker.stamp}
              href={TINT_STICKER_ARTWORK[sticker.stamp]}
              x={sticker.x - sticker.size / 2}
              y={sticker.y - sticker.size / 2}
              width={sticker.size}
              height={sticker.size}
              filter={`url(#${stickerFilter})`}
            />
          ))}
        </g>
      ))}
    </>
  );
}

/* The storm's sectors as the classic map dashed them, centre to rim; the polar sink covers their inner ends. */
const SECTOR_LINES = Array.from({ length: TABLE_SECTOR_COUNT }, (_, index) => {
  const rim = sectorRim(index);
  return `M${CENTER[0]} ${CENTER[1]}L${rim[0]} ${rim[1]}`;
}).join('');

/** The dashed sector lines, left off inside the polar sink when the board has one. */
function SectorLines({ polarSink, maskId }: Readonly<{ polarSink: string | undefined; maskId: string }>) {
  return (
    <g data-sectors>
      {polarSink ? (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={SPICE_BOARD_SIZE} height={SPICE_BOARD_SIZE}>
            <rect width={SPICE_BOARD_SIZE} height={SPICE_BOARD_SIZE} fill="#fff" />
            <path d={polarSink} fill="#000" stroke="#000" strokeWidth={2} />
          </mask>
        </defs>
      ) : null}
      <path
        d={SECTOR_LINES}
        fill="none"
        stroke="#000"
        strokeOpacity={0.3}
        strokeWidth={1.33}
        strokeDasharray="5.34 1.33"
        mask={polarSink ? `url(#${maskId})` : undefined}
      />
    </g>
  );
}

/** What an editor does with the card's map; only the editor's live proof passes it. */
export type SpiceMapEditing = BoardMarkupEditing;

/** A pointer's place on the map, in board coordinates. */
function toBoard(event: PointerEvent<HTMLDivElement>): [number, number] {
  const rect = event.currentTarget.getBoundingClientRect();
  return [
    ((event.clientX - rect.left) / rect.width) * SPICE_BOARD_SIZE,
    ((event.clientY - rect.top) / rect.height) * SPICE_BOARD_SIZE,
  ];
}

/** A surface over the whole map that turns pointer input into board coordinates: a drag on a token moves it, a click elsewhere paints. */
function EditSurface({
  board,
  tokens,
  tokenAssets,
  editing,
  shifted,
}: {
  shifted: boolean;
  board: Board;
  tokens: readonly Placement[];
  tokenAssets: TokenAssets;
  editing: SpiceMapEditing;
}) {
  const handlers = useBoardMarkupPointer<HTMLDivElement>({
    board,
    tokens,
    typeOf: (assetId) => tokenAssets[assetId]?.type,
    editing,
    toBoard,
  });
  return (
    <div
      className={`${unique.mapEdit} ${shifted ? unique.shiftedMap : ''}`}
      data-brush={editing.onTerritory ? '' : undefined}
      {...handlers}
    />
  );
}

/** A Spice card's map drawn from its linked board: the board's own artwork in the card's look, its tints oldest first over it in their own colours, then its placed tokens. */
export function SpiceBoardMap({
  board,
  tints,
  tokens = [],
  tokenAssets = {},
  look = DEFAULT_LOOK,
  editing,
}: {
  board: Board;
  tints: readonly BoardTint[];
  look?: Look;
  tokens?: readonly Placement[];
  tokenAssets?: TokenAssets;
  editing?: SpiceMapEditing;
}) {
  const shifted = look.style === 'textured-burn';
  const mapClass = `${unique.map} ${shifted ? unique.shiftedMap : ''}`;
  const idPrefix = useId().replaceAll(':', '');
  const territories = boardTerritoryList(board);
  const viewBox = `0 0 ${SPICE_BOARD_SIZE} ${SPICE_BOARD_SIZE}`;
  /* Game renderers sit outside the React Compiler; the board and its tints are kept by hand so a token drag only redraws the tokens. */
  const artwork = useMemo(
    () => <BoardArtwork board={board} faces={territories.map(({ face }) => face)} artwork={BOARD_ARTWORK} />,
    [board, territories]
  );
  const tintLayers = useMemo(
    () => (
      <CardTintLayers
        drawings={tints.map((tint) => tintDrawing(board, tint))}
        opacities={tints.map((tint) => tintOutlineOpacity(tint.color))}
        idPrefix={idPrefix}
      />
    ),
    [board, tints, idPrefix]
  );
  const polarSink = territories
    .filter(({ face }) => board.properties[face.key]?.type === 'polar')
    .map(({ face }) => face.path)
    .join(' ');

  return (
    <>
      {look.style === 'textured-burn' ? <div className={unique.mapPaper} aria-hidden /> : null}
      <svg className={mapClass} data-look={look.style} viewBox={viewBox} fillRule="evenodd" clipRule="evenodd">
        {artwork}
      </svg>
      {/* The board as it is, faded over the look: full strength shows only the look, none only the board. */}
      {look.style === 'plain' || look.strength >= 1 ? null : (
        <svg
          className={mapClass}
          data-look="plain"
          style={{ opacity: 1 - look.strength }}
          viewBox={viewBox}
          fillRule="evenodd"
          clipRule="evenodd"
        >
          {artwork}
        </svg>
      )}
      <svg
        className={`${unique.map_overlay} ${shifted ? unique.shiftedMap : ''}`}
        viewBox={viewBox}
        fillRule="evenodd"
        clipRule="evenodd"
      >
        {tintLayers}
        <SectorLines polarSink={polarSink || undefined} maskId={`${idPrefix}-sectors`} />
      </svg>
      <div className={`${unique.mapTokens} ${shifted ? unique.shiftedMap : ''}`}>
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
      {editing ? (
        <EditSurface shifted={shifted} board={board} tokens={tokens} tokenAssets={tokenAssets} editing={editing} />
      ) : null}
    </>
  );
}
