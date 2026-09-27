import type { TablePiece } from '@shared/play/model';
import { tokenBoxRatio } from '@shared/play/tableGeometry';
import { PublishedImage } from '@ui/content/PublishedImage';

import { card } from '@game/data/sizes';

type Props = {
  piece: TablePiece;
  /** The publication, or null when the piece has none, which draws the missing state. */
  src: string | null;
  name: string;
  /** The box the control lays out, in pixels; the artwork is fitted inside it at the piece's own shape. */
  width: number;
  height: number;
  radius?: string;
};

/** A piece's published face at its own proportions: a card's, a rectangle token's, and square for every other token. */
function artworkAspect(piece: TablePiece) {
  return piece.kind === 'card' ? card.height / card.width : (tokenBoxRatio(piece) ?? 1);
}

/**
 * A piece's artwork in a panel control, arriving through `PublishedImage` inside the fixed box the control lays out.
 * The box keeps the control's size while the image loads, and the fit keeps a card and a token from stretching to the same box.
 */
export function PieceArtwork({ piece, src, name, width, height, radius }: Props) {
  const aspect = artworkAspect(piece);
  return (
    <div style={{ width, height, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: Math.min(width, height / aspect) }}>
        <PublishedImage src={src} name={name} aspect={aspect} radius={radius} />
      </div>
    </div>
  );
}
