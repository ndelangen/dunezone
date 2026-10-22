/* oxlint-disable jsx-a11y/alt-text -- Static decorative game-card layers, not content images. */
import type { CustomCardTokens, SpiceBoardLook } from '@shared/assets/schema';
import { SPICE_BOARD_SIZE } from '@shared/assets/schema';
import type { Board } from '@shared/boards/geometry';
import type { BoardTint, BoardTokenPlacement } from '@shared/boards/markup';
import { boardTerritoryList, tintDrawing } from '@shared/boards/tintDrawing';
import { useId, useMemo } from 'react';
import type { PointerEvent } from 'react';
import type { z } from 'zod';

import { BOARD_ARTWORK } from '../board/artwork';
import { BoardArtwork } from '../board/Board';
import { placedTokenHeight, TintDrawingLayers, useBoardMarkupPointer } from '../board/BoardMarkup';
import type { BoardMarkupEditing } from '../board/BoardMarkup';
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
  const stickerFilter = `${useId().replaceAll(':', '')}-sticker`;
  const territories = boardTerritoryList(board);
  const viewBox = `0 0 ${SPICE_BOARD_SIZE} ${SPICE_BOARD_SIZE}`;
  /* Game renderers sit outside the React Compiler; the board and its tints are kept by hand so a token drag only redraws the tokens. */
  const artwork = useMemo(
    () => <BoardArtwork board={board} faces={territories.map(({ face }) => face)} artwork={BOARD_ARTWORK} />,
    [board, territories]
  );
  const tintLayers = useMemo(
    () => <TintDrawingLayers drawings={tints.map((tint) => tintDrawing(board, tint))} filterId={stickerFilter} />,
    [board, tints, stickerFilter]
  );

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
