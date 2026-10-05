import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import type { ComponentProps, ReactNode } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { TroopToken } from '../assets/faction/troop/Troop';
import './RulebookRenderer.css';

type Point = { x: number; y: number };

export type RulebookTerritorySceneProps = Readonly<{
  label: string;
  size?: 'compact' | 'large' | 'fit-width';
  board: { imageUrl: string; geometry: ComponentGeometry };
  viewport: Point & { width: number; height: number };
  highlights: readonly { territory: string; color: string; opacity?: number }[];
  troops: readonly (Point & {
    id: string;
    artwork?: ComponentProps<typeof TroopToken>;
    count: number;
    columns: number;
    size: number;
    gap: number;
  })[];
  overlay?: ReactNode;
  labels: readonly (Point & { text: string; width: number })[];
}>;

/** Callers place pieces in board coordinates; this scene keeps the maintained board and its territory outlines aligned. */
export function RulebookTerritoryScene({
  label,
  size = 'compact',
  board,
  viewport,
  highlights,
  troops,
  labels,
  overlay,
}: RulebookTerritorySceneProps) {
  const imageUrl = useAsset(board.imageUrl);
  const { width, height } = board.geometry;
  return (
    <svg
      className="rulebookTerritoryScene"
      data-size={size}
      viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
      role="img"
      aria-label={label}
    >
      <image href={imageUrl} width={width} height={height} />
      {highlights.map((highlight) => {
        const part = board.geometry.parts.find(({ key }) => key === highlight.territory);
        return part?.highlight ? (
          <g key={highlight.territory} transform={`scale(${width} ${height})`}>
            {part.highlight.paths.map((path, index) => (
              <path
                key={index}
                d={path.d}
                transform={path.transform ? `matrix(${path.transform.join(' ')})` : undefined}
                fill={highlight.color}
                fillOpacity={highlight.opacity ?? 0.35}
                stroke={highlight.color}
                strokeWidth="0.0015"
              />
            ))}
          </g>
        ) : null;
      })}
      {troops.map((group) =>
        Array.from({ length: group.count }, (_, index) => (
          <foreignObject
            key={`${group.id}-${index}`}
            x={group.x + (index % group.columns) * (group.size + group.gap)}
            y={group.y + Math.floor(index / group.columns) * (group.size + group.gap)}
            width={group.size}
            height={group.size}
          >
            <div className="rulebookTerritoryTroop">
              {group.artwork ? (
                <TroopToken {...group.artwork} />
              ) : (
                <span className="rulebookTerritoryMissingTroop" aria-label="Troop artwork unavailable">
                  ?
                </span>
              )}
            </div>
          </foreignObject>
        ))
      )}
      {labels.map((entry, index) => (
        <g key={index} className="rulebookTerritoryLabel">
          <rect x={entry.x - entry.width / 2} y={entry.y - 9} width={entry.width} height="14" />
          <text x={entry.x} y={entry.y}>
            {entry.text}
          </text>
        </g>
      ))}
      {overlay}
    </svg>
  );
}
