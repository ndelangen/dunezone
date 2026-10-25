import { componentGeometrySchema } from '../../src/shared/asset-publishing/componentGeometry';
import { boardAssetDataSchema } from '../../src/shared/asset-publishing/publication';
import { resolvePublicationCapture } from '../../src/shared/asset-publishing/publicationTargets';
import { boardComponentGeometry } from '../../src/shared/boards/componentGeometry';
import type { Board } from '../../src/shared/boards/geometry';

/**
 * A saved board's territories as a Rulebook illustration's component geometry, in the frame of its published image.
 * A board that does not draw, or whose geometry would not fit the schema, gives none.
 */
export function boardPublicationGeometry(board: Board) {
  const capture = resolvePublicationCapture('board');
  if (capture.output !== 'image') {
    return undefined;
  }
  try {
    const parsed = componentGeometrySchema.safeParse(boardComponentGeometry(board, capture.widthPx, capture.heightPx));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** The geometry of the board a publication job captured, so the stored image and its territories always come from one save. */
export function capturedBoardGeometry(assetData: unknown) {
  const parsed = boardAssetDataSchema.safeParse(assetData);
  return parsed.success ? boardPublicationGeometry(parsed.data.board) : undefined;
}
