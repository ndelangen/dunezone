import type { TablePiece } from '@shared/play/model';
import { stackLayerItemIndex } from '@shared/play/pieceFlip';
import { visibleLayerCount } from '@shared/play/tableGeometry';

/** The published image a piece shows on top: the upper face of its top layer. */
export function topFaceHref(piece: TablePiece): string | undefined {
  const item = topItem(piece);
  return item?.artwork?.[item.faceUp ? 'front' : 'back'];
}

/** The item the table shows on top of a piece's stack. */
export function topItem(piece: TablePiece): TablePiece['items'][number] | undefined {
  if (piece.kind === 'marker' || piece.items.length === 0) {
    return undefined;
  }
  const shownLayers = visibleLayerCount(piece);
  return piece.items[stackLayerItemIndex(piece.items.length, shownLayers, shownLayers - 1, piece.flipRevision)];
}
