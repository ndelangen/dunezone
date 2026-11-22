/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { isFactionToken } from '@shared/play/factionToken';
import { pieceCount, topItemFaceUp } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { pieceLabelHeight } from '@shared/play/tableGeometry';

import type { usePieceFlipAnimation } from './usePieceFlipAnimation';

export function PieceBadge({
  piece,
  owner,
  peeked,
  selected,
  hovered,
  labelRef,
  badgeRef,
  classNames,
}: {
  piece: TablePiece;
  owner: string | undefined;
  peeked: string | undefined;
  selected: boolean;
  hovered: boolean;
} & Pick<ReturnType<typeof usePieceFlipAnimation>, 'labelRef' | 'badgeRef'> & { classNames: Record<string, string> }) {
  return (
    <group ref={labelRef} position={[0, pieceLabelHeight(piece), 0]}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        {/*
         * The tag is as large as the count, so the count sits where it always has; the name hangs above it while Control is held.
         * The piece under the pointer shows both, so a player finds a stack's size without knowing the keys (#2988).
         * A faction token is one of a kind, so its count never shows; its name still hangs in the same place.
         */}
        <span className={`scene-piece-tag ${classNames.pieceTag}`} data-hovered={hovered || undefined}>
          <span className={`scene-piece-name ${classNames.pieceName}`}>
            <span className="scene-piece-name__label">{piece.label}</span>
            {owner ? <span className={`scene-piece-name__owner ${classNames.pieceNameOwner}`}>{owner}</span> : null}
            {peeked ? <span className={`scene-piece-name__peeked ${classNames.pieceNamePeeked}`}>{peeked}</span> : null}
          </span>
          <span
            ref={badgeRef}
            className={`scene-piece-count ${classNames.pieceCount} ${selected ? `scene-piece-count--selected ${classNames.pieceCountSelected}` : ''}`}
            data-piece-id={piece.id}
            data-uncounted={isFactionToken(piece) || undefined}
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
