import { tokenOutline, tokenShapeOfType } from '@shared/assets/tokenOutline';
/* oxlint-disable jsx-a11y/alt-text -- Static decorative board layers, not content images. */
import type { Board } from '@shared/boards/geometry';
import { BOARD_FRAME_SIZE } from '@shared/boards/markup';
import type { BoardTokenPlacement } from '@shared/boards/markup';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { createContext, useContext, useId } from 'react';
import type { PointerEvent } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { placedTokenHeight, TintDrawingLayers, useBoardMarkupPointer } from '../assets/board/BoardMarkup';
import type { BoardMarkupEditing } from '../assets/board/BoardMarkup';

type BoardBlock = Extract<RulebookRenderBlockV1, { kind: 'board-scene' }>;
type PlacedToken = NonNullable<BoardBlock['tokens']>[number];

/** What the Rulebook editor hands the preview for the Block it has open: the board and its tokens as the editor holds them, and what painting and dragging do. */
export type RulebookBoardMarkupEditor = {
  board: Board;
  tokens: readonly BoardTokenPlacement[];
  typeOf: (assetId: string) => string | undefined;
  editing: BoardMarkupEditing;
};

/**
 * The Block the editor has open and its markup editing;
 * the preview's board scene for that Block takes it.
 * Published pages and readers have none, so their scenes draw nothing interactive.
 */
export const RulebookBoardMarkupEditing = createContext<{ blockId: string; editor: RulebookBoardMarkupEditor } | null>(
  null
);

/** The editor for a Block's board scene, when the editor has that Block open. */
export function useRulebookBoardMarkupEditor(blockId: string | undefined) {
  const context = useContext(RulebookBoardMarkupEditing);
  return blockId !== undefined && context?.blockId === blockId ? context.editor : undefined;
}

function Token({ token, selected }: Readonly<{ token: PlacedToken; selected: boolean }>) {
  const href = useAsset(token.imageUrl);
  const height = placedTokenHeight(token, token.type);
  const shape = tokenShapeOfType(token.type) ?? 'square';
  /* A published face is an opaque square, so the token's own shape is cut here, as Spice cards and the table cut it. */
  const { clipPath } = tokenOutline(shape);
  return (
    <g transform={`translate(${token.x} ${token.y}) rotate(${token.rotation})`} data-token-instance={token.layerId}>
      <foreignObject x={-token.size / 2} y={-height / 2} width={token.size} height={height}>
        <img
          src={href}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: shape === 'round' ? '50%' : clipPath ? undefined : '8%',
            clipPath,
          }}
        />
      </foreignObject>
      {selected ? (
        <rect
          x={-token.size / 2 - 4}
          y={-height / 2 - 4}
          width={token.size + 8}
          height={height + 8}
          rx={Math.min(token.size, height) / 2 + 4}
          fill="none"
          stroke="#ffd43b"
          strokeWidth={3}
        />
      ) : null}
    </g>
  );
}

/** Scales the board's own frame onto the scene's image, which the board's published capture fills. */
const frameTransform = (width: number, height: number) =>
  `scale(${width / BOARD_FRAME_SIZE} ${height / BOARD_FRAME_SIZE})`;

/** A scene's tints and placed tokens over its saved board, under its troops and markers. */
export function RulebookBoardMarkupLayer({
  scene,
  width,
  height,
  selectedToken,
}: Readonly<{
  scene: Pick<BoardBlock, 'tints' | 'tokens'>;
  width: number;
  height: number;
  selectedToken?: string | null;
}>) {
  const filterId = `${useId().replaceAll(':', '')}-sticker`;
  if (!scene.tints?.length && !scene.tokens?.length) {
    return null;
  }
  return (
    <g transform={frameTransform(width, height)} data-board-markup="">
      {scene.tints?.length ? <TintDrawingLayers drawings={scene.tints} filterId={filterId} /> : null}
      {scene.tokens?.map((token) => (
        <Token key={token.layerId} token={token} selected={selectedToken === token.layerId} />
      ))}
    </g>
  );
}

/** A pointer's place in the board's frame, read through the surface's own transform so the scene's crop and scale do not matter. */
function toBoard(event: PointerEvent<SVGRectElement>): [number, number] {
  const matrix = event.currentTarget.getScreenCTM();
  if (!matrix) {
    return [-1, -1];
  }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return [point.x, point.y];
}

/** The editor's input surface over the whole scene: a drag on a token moves it, a click elsewhere paints. */
export function RulebookBoardEditSurface({
  editor,
  width,
  height,
}: Readonly<{ editor: RulebookBoardMarkupEditor; width: number; height: number }>) {
  const handlers = useBoardMarkupPointer<SVGRectElement>({ ...editor, toBoard });
  const active = !!editor.editing.onTerritory || !!editor.editing.onTokenMove;
  return active ? (
    <g transform={frameTransform(width, height)}>
      <rect
        className="rulebookBoardEditSurface"
        data-brush={editor.editing.onTerritory ? '' : undefined}
        width={BOARD_FRAME_SIZE}
        height={BOARD_FRAME_SIZE}
        fill="transparent"
        {...handlers}
      />
    </g>
  ) : null;
}
