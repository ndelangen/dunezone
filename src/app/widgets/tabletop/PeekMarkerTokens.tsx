/* @jsxImportSource ./three-jsx */
import type { TablePiece } from '@shared/play/model';
import type { ComponentType } from 'react';

import { PEEK_MARKER_SCALE, peekMarkerSlots } from './peekMarkers';

/** Each peeker's token, small, in the bottom right corner of the card or deck it peeked at, drawn by `Token` as the table draws a token stack. */
export function PeekMarkers({
  piece,
  tokens,
  Token,
}: {
  piece: TablePiece;
  tokens: readonly TablePiece[];
  Token: ComponentType<{ piece: TablePiece }>;
}) {
  if (!tokens.length) {
    return null;
  }
  const slots = peekMarkerSlots(piece, tokens.length);
  return tokens.map((token, index) => (
    <group key={token.id} position={slots[index]} scale={PEEK_MARKER_SCALE}>
      <Token piece={token} />
    </group>
  ));
}
