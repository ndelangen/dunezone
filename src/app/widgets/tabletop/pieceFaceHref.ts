import type { TablePiece } from '@shared/play/model';
import { stackLayerItemIndex } from '@shared/play/pieceFlip';
import { visibleLayerCount } from '@shared/play/tableGeometry';

export function topFaceHref(piece: TablePiece): string | undefined {
  if (piece.kind === 'marker' || piece.items.length === 0) {
    return undefined;
  }
  const shownLayers = visibleLayerCount(piece);
  const item = piece.items[stackLayerItemIndex(piece.items.length, shownLayers, shownLayers - 1, piece.flipRevision)];
  return item?.artwork?.[item.faceUp ? 'front' : 'back'];
}
