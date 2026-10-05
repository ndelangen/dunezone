import type { RulebookResolvedSource } from '@shared/rulebooks/sources';
import { rulebookSourceClipPath } from '@shared/rulebooks/sources';
import type { ComponentProps } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { TroopToken } from '../assets/faction/troop/Troop';
import './RulebookRenderer.css';

type Piece = { id: string; label?: string } & (
  | { kind: 'source'; source: RulebookResolvedSource; count?: number }
  | { kind: 'troops'; artwork: ComponentProps<typeof TroopToken>; count: number }
);
type Group = { label: string; pieces: readonly Piece[] };
export type RulebookPieceMovementProps = Readonly<{
  left: Group;
  right: Group;
  direction?: 'exchange' | 'right';
}>;

function SourcePiece({ source, count = 1 }: Readonly<{ source: RulebookResolvedSource; count?: number }>) {
  const imageUrl = useAsset(source.status === 'ready' ? source.imageUrl : '');
  return source.status === 'ready' ? (
    <div className="rulebookMovementSources">
      {Array.from({ length: count }, (_, index) => (
        <img key={index} src={imageUrl} alt={source.name} style={{ clipPath: rulebookSourceClipPath(source) }} />
      ))}
    </div>
  ) : (
    <span>{source.status === 'unselected' ? 'No source selected' : 'Source unavailable'}</span>
  );
}

function PieceGroup({ group }: Readonly<{ group: Group }>) {
  return (
    <div className="rulebookMovementGroup">
      <strong>{group.label}</strong>
      <div className="rulebookMovementPieces">
        {group.pieces.map((piece) => (
          <figure key={piece.id}>
            {piece.kind === 'source' ? (
              <SourcePiece source={piece.source} count={piece.count} />
            ) : (
              <div className="rulebookMovementTroops">
                {Array.from({ length: piece.count }, (_, index) => (
                  <span key={index}>
                    <TroopToken {...piece.artwork} />
                  </span>
                ))}
              </div>
            )}
            {piece.label ? <figcaption>{piece.label}</figcaption> : null}
          </figure>
        ))}
      </div>
    </div>
  );
}

/** Callers supply the pieces at either end; the renderer shows an exchange, transfer, or resulting groups. */
export function RulebookPieceMovement({ left, right, direction }: RulebookPieceMovementProps) {
  return (
    <div className="rulebookPieceMovement">
      <PieceGroup group={left} />
      {direction ? (
        <span className="rulebookMovementArrow" aria-label={direction === 'exchange' ? 'Exchange' : 'Move right'}>
          {direction === 'exchange' ? '⇄' : '→'}
        </span>
      ) : null}
      <PieceGroup group={right} />
    </div>
  );
}
