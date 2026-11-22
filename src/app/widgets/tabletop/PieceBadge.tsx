/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { isFactionToken } from '@shared/play/factionToken';
import { pieceCount, topItemFaceUp } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { pieceLabelHeight } from '@shared/play/tableGeometry';

import { countedLabel } from './countedLabel';
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
  const count = pieceCount(piece);
  const uncounted = isFactionToken(piece);
  const counted = count > 1 && !uncounted ? countedLabel(piece, count) : null;
  return (
    <group ref={labelRef} position={[0, pieceLabelHeight(piece), 0]}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        {/*
         * The tag is as large as the count, so the count sits where it always has; the name hangs above it while Control is held.
         * When name and count show together, on the piece under the pointer or with both keys held, they read as one tooltip
         * at the count's place, "10 Harkonnen troops", so a player finds a stack's size without knowing the keys (#2988).
         * A faction token is one of a kind, so its count never shows, and its name takes the count's place.
         */}
        <span
          className={`scene-piece-tag ${classNames.pieceTag}`}
          data-hovered={hovered || undefined}
          data-uncounted={uncounted || undefined}
          data-selected={selected || undefined}
        >
          <span className={`scene-piece-name ${classNames.pieceName}`}>
            {/* The name alone while only names show; with the count it reads as one line, "10 Harkonnen Troops". */}
            <span className="scene-piece-name__label">
              {counted ? (
                <>
                  <span className={`scene-piece-name__alone ${classNames.pieceNameAlone}`}>{piece.label}</span>
                  <span className={`scene-piece-name__count ${classNames.pieceNameCount}`}>{counted}</span>
                </>
              ) : (
                piece.label
              )}
            </span>
            {owner ? <span className={`scene-piece-name__owner ${classNames.pieceNameOwner}`}>{owner}</span> : null}
            {peeked ? <span className={`scene-piece-name__peeked ${classNames.pieceNamePeeked}`}>{peeked}</span> : null}
          </span>
          <span
            ref={badgeRef}
            className={`scene-piece-count ${classNames.pieceCount} ${selected ? `scene-piece-count--selected ${classNames.pieceCountSelected}` : ''}`}
            data-piece-id={piece.id}
            data-uncounted={uncounted || undefined}
            data-face-up={topItemFaceUp(piece)}
            data-flip-revision={piece.flipRevision ?? 0}
            data-flipping="false"
          >
            {count}
          </span>
        </span>
      </Html>
    </group>
  );
}
