import { tokenOutline, tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { TablePiece } from '@shared/play/model';
import { tokenBoxRatio } from '@shared/play/tableGeometry';
import { PublishedImage } from '@ui/content/PublishedImage';
import { useMemo } from 'react';

import { card } from '@game/data/sizes';

import { usePredictionFace } from './prediction/predictionFace';

type Props = {
  piece: TablePiece;
  /** The publication, or null when the piece has none, which draws the missing state. */
  src: string | null;
  name: string;
  /** The box the control lays out, in pixels; the artwork is fitted inside it at the piece's own shape. */
  width: number;
  height: number;
  /** A card's corner. A token ignores it: its own type decides its cut, the same as everywhere else it is shown. */
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
  const shape = piece.kind === 'card' ? null : tokenShapeOfType(piece.items[0]?.artwork?.type);
  /* A token whose type names no shape keeps its square, the same as an uncut card. */
  const outline = piece.kind === 'card' ? { radius } : shape ? tokenOutline(shape) : {};
  return (
    <div style={{ width, height, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: Math.min(width, height / aspect), position: 'relative' }}>
        <PublishedImage src={src} name={name} aspect={aspect} {...outline} />
        <PredictionOverlay piece={piece} src={src} />
      </div>
    </div>
  );
}

/* A prediction card's front shows its chosen logo and turn over the published base (#1753); its back shows nothing more. */
function PredictionOverlay({ piece, src }: Pick<Props, 'piece' | 'src'>) {
  const artwork = piece.items.find((item) => item.artwork?.front === src)?.artwork;
  const face = usePredictionFace(src ? artwork?.prediction : undefined);
  const url = useMemo(() => face?.toDataURL(), [face]);
  if (!url) {
    return null;
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
