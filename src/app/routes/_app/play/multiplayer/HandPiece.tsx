import { Image } from '@mantine/core';
import { isBattleLeader } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { useState } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { backgroundPresets } from '@game/data/backgrounds';
import { card } from '@game/data/sizes';

import { PieceArtwork } from '../../../../widgets/tabletop/PieceArtwork';

export function pieceName(piece: TablePiece) {
  return piece.items[0]?.artwork?.name ?? piece.label;
}

/**
 * The hand piece under the pointer, for the Alt close-up, looked up among the pieces shown so one that leaves them lets go of it.
 * `hover` gives each piece's element the pointer handlers that follow it.
 */
export function useHandCloseUp(pieces: readonly TablePiece[]) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  return {
    piece: pieces.find((piece) => piece.id === hoveredId) ?? null,
    hover: (piece: TablePiece) => ({
      onPointerEnter: () => setHoveredId(piece.id),
      onPointerLeave: () => setHoveredId((id) => (id === piece.id ? null : id)),
    }),
  };
}

/* A piece without a publication draws the Traitor stand-in, so only real URLs reach `PublishedImage`. */
export function PieceImage({
  piece,
  width = 60,
  height: requestedHeight,
}: {
  piece: TablePiece;
  width?: number;
  height?: number;
}) {
  const height = requestedHeight ?? (piece.kind === 'card' ? 80 : 60);
  const front = piece.items[0]?.artwork?.front;
  const radius = isBattleLeader(piece) ? '50%' : undefined;
  if (front) {
    return <PieceArtwork piece={piece} src={front} name={pieceName(piece)} width={width} height={height} />;
  }
  if (piece.kind === 'card') {
    return (
      <div style={{ width }} role="img" aria-label={pieceName(piece)}>
        <CanvasScale canvasWidth={card.width} canvasHeight={card.height}>
          <CardBack
            name={pieceName(piece)}
            image="/vector/icon/traitor.svg"
            background={backgroundPresets.traitor}
            imageOffset={[0, 10]}
            imageScale={1.1}
          />
        </CanvasScale>
      </div>
    );
  }
  return (
    <Image
      src="/vector/icon/traitor.svg"
      alt={pieceName(piece)}
      draggable={false}
      fit="contain"
      radius={radius}
      h={height}
      w={width}
    />
  );
}
