/* oxlint-disable jsx-a11y/alt-text -- Static decorative game-card layers, not content images. */
import type { CustomCardToken } from '@shared/assets/schema';
import { derive } from '@shared/boards/geometry';
import type { Board, Face, Properties } from '@shared/boards/geometry';
import { useId } from 'react';
import type { z } from 'zod';

import { BOARD_ARTWORK } from '../board/artwork';
import { BoardArtwork } from '../board/Board';
import { CardToken } from './CardToken';
import unique from './Spice.module.css';

/** The saved board's coordinate frame; card highlights and token positions share it, so they survive a board switch. */
const BOARD_SIZE = 487.06;
/* The legacy filter radii were tuned in the 100-unit map frame. */
const FRAME = BOARD_SIZE / 100;

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

/** How the highlight effect is drawn; the study compares these before one becomes the default. */
export type SpiceHighlightTreatment = 'outlined' | 'tinted';

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
  treatment = 'outlined',
}: {
  board: Board;
  highlights: readonly SpiceHighlight[];
  tokens?: readonly SpiceTokenPlacement[];
  tokenAssets?: Record<string, z.infer<typeof CustomCardToken> | null>;
  treatment?: SpiceHighlightTreatment;
}) {
  const prefix = useId().replaceAll(':', '');
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
              id={`${prefix}-h${index}`}
              paths={matched.map((face) => face.path)}
              color={highlight.color}
              opacity={highlight.opacity}
              treatment={treatment}
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

function HighlightLayer({
  id,
  paths,
  color,
  opacity,
  treatment,
}: {
  id: string;
  paths: string[];
  color: string;
  opacity: number;
  treatment: SpiceHighlightTreatment;
}) {
  if (treatment === 'tinted') {
    return (
      <g data-highlight opacity={opacity}>
        {paths.map((d, i) => (
          <path key={i} d={d} fill={color} fillOpacity={0.75} stroke="#000" strokeWidth={0.62 * FRAME} />
        ))}
      </g>
    );
  }
  /* The alpha contrast turns any coverage into a solid mask, so opacity is applied to the finished group instead of the mask. */
  return (
    <g data-highlight opacity={opacity}>
      <defs>
        <filter id={`${id}-filter`} x="-10%" y="-10%" width="120%" height="120%">
          <feColorMatrix
            result="CONTRASTED"
            in="SourceAlpha"
            type="matrix"
            values="1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 34 0"
          />
          <feMorphology in="CONTRASTED" result="DILATED0" operator="dilate" radius={1.03 * FRAME} />
          <feMorphology in="CONTRASTED" result="DILATED1" operator="dilate" radius={0.62 * FRAME} />
          <feMorphology in="CONTRASTED" result="DILATED2" operator="dilate" radius={0.21 * FRAME} />
          <feFlood floodColor="#F8F6E2" result="CREAM" />
          <feFlood floodColor="#000" result="EDGE" />
          <feFlood floodColor={color} result="FILL" />
          <feComposite in="CREAM" in2="DILATED0" operator="in" result="OUTLINE0" />
          <feComposite in="EDGE" in2="DILATED1" operator="in" result="OUTLINE1" />
          <feComposite in="FILL" in2="DILATED2" operator="in" result="OUTLINE2" />
          <feMerge>
            <feMergeNode in="OUTLINE0" />
            <feMergeNode in="OUTLINE1" />
            <feMergeNode in="OUTLINE2" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-filter)`}>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="#000" />
        ))}
      </g>
    </g>
  );
}
