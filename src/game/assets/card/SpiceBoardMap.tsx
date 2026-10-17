/* oxlint-disable jsx-a11y/alt-text -- Static decorative game-card layers, not content images. */
import type { CustomCardToken } from '@shared/assets/schema';
import { derive } from '@shared/boards/geometry';
import type { Board, Face, Properties } from '@shared/boards/geometry';
import type { z } from 'zod';

import { BOARD_ARTWORK } from '../board/artwork';
import { BoardArtwork } from '../board/Board';
import { CardToken } from './CardToken';
import unique from './Spice.module.css';

/** The saved board's coordinate frame; card highlights and token positions share it, so they survive a board switch. */
const BOARD_SIZE = 487.06;
/* The legacy card outline was 0.62 units wide in the 100-unit map frame. */
const EDGE_WIDTH = (0.62 * BOARD_SIZE) / 100;

export type TerritoryType = Properties['type'];

/** One authored selection: a named territory, or every current territory of a type on the selected board. */
export type SpiceHighlight = Readonly<{
  target: { territory: string } | { type: TerritoryType };
  color: string;
  opacity: number;
}>;

/** A placed token instance, in board coordinates. The board never moves it. */
export type SpiceTokenPlacement = Readonly<{
  layerId: string;
  asset_id: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}>;

export const SPICE_HIGHLIGHT_DEFAULT = { color: '#9E5F00', opacity: 1 } as const;

/** Missing names stay stored and only drop out of the drawing; the editor shows the warning. */
export function resolveSpiceHighlights(board: Board, faces: Face[], highlights: readonly SpiceHighlight[]) {
  const missing: string[] = [];
  const resolved = highlights.map((highlight) => {
    const { target } = highlight;
    const matched = faces.filter((face) => {
      const property = board.properties[face.key];
      return 'territory' in target ? property?.id === target.territory : property?.type === target.type;
    });
    if ('territory' in target && !matched.length) {
      missing.push(target.territory);
    }
    return { highlight, faces: matched };
  });
  return { resolved, missing };
}

export function SpiceBoardMap({
  board,
  highlights,
  tokens = [],
  tokenAssets = {},
}: {
  board: Board;
  highlights: readonly SpiceHighlight[];
  tokens?: readonly SpiceTokenPlacement[];
  tokenAssets?: Record<string, z.infer<typeof CustomCardToken> | null>;
}) {
  const { faces } = derive(board);
  const { resolved } = resolveSpiceHighlights(board, faces, highlights);
  const viewBox = `0 0 ${BOARD_SIZE} ${BOARD_SIZE}`;

  return (
    <>
      <svg className={unique.map} viewBox={viewBox} fillRule="evenodd" clipRule="evenodd">
        <BoardArtwork board={board} faces={faces} artwork={BOARD_ARTWORK} />
      </svg>
      <svg className={unique.map_overlay} viewBox={viewBox} fillRule="evenodd" clipRule="evenodd">
        {resolved.map(({ highlight, faces: matched }, index) =>
          matched.length ? (
            <HighlightLayer
              key={index}
              paths={matched.map((face) => face.path)}
              color={highlight.color}
              opacity={highlight.opacity}
            />
          ) : null
        )}
      </svg>
      <div className={unique.mapTokens}>
        {tokens.map((token) => {
          const asset = tokenAssets[token.asset_id];
          return asset ? (
            <div
              key={token.layerId}
              className={unique.mapToken}
              data-token-instance={token.layerId}
              style={{
                left: `${(token.x / BOARD_SIZE) * 100}%`,
                top: `${(token.y / BOARD_SIZE) * 100}%`,
                width: `${(token.size / BOARD_SIZE) * 100}%`,
                height: `${((token.size * (asset.type === 'token-enhance' ? 186 : 300)) / 300 / BOARD_SIZE) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${token.rotation}deg)`,
              }}
            >
              <CardToken token={asset} />
            </div>
          ) : null;
        })}
      </div>
    </>
  );
}

/* Norbert chose a see-through tint over the legacy outlined filter (#1969): the map shows through, and opacity fades the whole layer. */
function HighlightLayer({ paths, color, opacity }: { paths: string[]; color: string; opacity: number }) {
  return (
    <g data-highlight opacity={opacity}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill={color} fillOpacity={0.75} stroke="#000" strokeWidth={EDGE_WIDTH} />
      ))}
    </g>
  );
}
