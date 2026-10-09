/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { pieceCount, topItemFaceUp } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { pieceLabelHeight } from '@shared/play/tableGeometry';

import type { usePieceFlipAnimation } from './usePieceFlipAnimation';

export function PieceBadge({
  piece,
  owner,
  peeked,
  selected,
  labelRef,
  badgeRef,
  classNames,
}: { piece: TablePiece; owner: string | undefined; peeked: string | undefined; selected: boolean } & Pick<
  ReturnType<typeof usePieceFlipAnimation>,
  'labelRef' | 'badgeRef'
> & { classNames: Record<string, string> }) {
  return (
    <group ref={labelRef} position={[0, pieceLabelHeight(piece), 0]}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        {/* The tag is as large as the count, so the count sits where it always has; the name hangs above it while Control is held. */}
        <span className={`scene-piece-tag ${classNames.pieceTag}`}>
          <span className={`scene-piece-name ${classNames.pieceName}`}>
            <span className="scene-piece-name__label">{piece.label}</span>
            {owner ? <span className={`scene-piece-name__owner ${classNames.pieceNameOwner}`}>{owner}</span> : null}
            {peeked ? <span className={`scene-piece-name__peeked ${classNames.pieceNamePeeked}`}>{peeked}</span> : null}
          </span>
          <span
            ref={badgeRef}
            className={`scene-piece-count ${classNames.pieceCount} ${selected ? `scene-piece-count--selected ${classNames.pieceCountSelected}` : ''}`}
            data-piece-id={piece.id}
            data-face-up={topItemFaceUp(piece)}
            data-flip-revision={piece.flipRevision ?? 0}
            data-flipping="false"
          >
            {pieceCount(piece)}
          </span>
        </span>
      </Html>
    </group>
  );
}
