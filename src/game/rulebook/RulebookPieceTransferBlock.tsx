import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import type { ComponentProps } from 'react';

import { RulebookPieceMovement } from './RulebookPieceMovement';
import { rulebookTroopArtwork } from './rulebookTroopArtwork';

type Transfer = Extract<RulebookRenderBlockV1, { kind: 'piece-transfer' }>;

function movementGroup(group: Transfer['left']): ComponentProps<typeof RulebookPieceMovement>['left'] {
  return {
    label: group.label,
    pieces: group.pieces.map((piece) =>
      piece.kind === 'source'
        ? piece
        : {
            id: piece.id,
            kind: 'troops',
            label: piece.label,
            count: piece.count,
            artwork: rulebookTroopArtwork(piece),
          }
    ),
  };
}

/** Callers supply referenced piece groups; this visual owns their transfer diagram. */
export function RulebookPieceTransferVisual({
  value,
}: Readonly<{ value: Pick<Transfer, 'left' | 'right' | 'direction'> }>) {
  return (
    <RulebookPieceMovement
      left={movementGroup(value.left)}
      right={movementGroup(value.right)}
      direction={value.direction === 'none' ? undefined : value.direction}
    />
  );
}

/** A transfer occupies its layout slot without adding a numbered explanation. */
export function RulebookPieceTransferBlock({ block }: Readonly<{ block: Transfer }>) {
  return (
    <section id={block.anchor} data-rulebook-block-anchor={block.anchor} data-rulebook-block-id={block.id}>
      <RulebookPieceTransferVisual value={block} />
    </section>
  );
}
