import { Tooltip } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { useContext, useRef } from 'react';

import { PieceArtwork } from '../../../../widgets/tabletop/PieceArtwork';
import { PieceFaceCloseUp } from '../../../../widgets/tabletop/PieceCloseUp';
import { CompassActiveContext } from '../compass/controlsActive';
import { PieceTooltipLabel } from '../panels/inventory/PieceTooltipLabel';
import { useHandCloseUp } from './HandPiece';
import styles from './HeldTechTokens.module.css';

/** The faction tokens' size in the alliance strip beside them, so a held tech token reads at the same weight. */
const HELD_TECH_TOKEN_SIZE = 26;

/* The face a held token shows everyone: its front while face up, its back once turned over. */
function shownFace(piece: TablePiece) {
  const item = piece.items[0];
  return item?.faceUp ? item.artwork?.front : item?.artwork?.back;
}

/**
 * The tech tokens a faction holds, side by side as their gears, for everyone to see who holds which.
 * Each names itself and what it does in its tooltip, as in the Shared table inventory, and Alt shows it larger beside the pointer.
 */
export function HeldTechTokens({
  tokens,
  size = HELD_TECH_TOKEN_SIZE,
}: Readonly<{ tokens: readonly TablePiece[]; size?: number }>) {
  const active = useContext(CompassActiveContext);
  const area = useRef<HTMLDivElement>(null);
  const closeUp = useHandCloseUp(tokens);
  return (
    <div ref={area} className={styles.tokens} role="list" aria-label="Tech tokens held">
      {tokens.map((piece) => {
        const item = piece.items[0];
        const src = shownFace(piece);
        const name = item?.artwork?.name ?? piece.label;
        return (
          <Tooltip
            key={piece.id}
            label={<PieceTooltipLabel piece={piece} />}
            multiline
            w={260}
            withArrow
            openDelay={250}
          >
            <span role="listitem" aria-label={name} className={styles.token} {...closeUp.hover(piece)}>
              <PieceArtwork piece={piece} src={src ?? null} name={name} width={size} height={size} />
            </span>
          </Tooltip>
        );
      })}
      {active && (
        <PieceFaceCloseUp
          area={area}
          piece={closeUp.piece}
          src={closeUp.piece ? shownFace(closeUp.piece) : undefined}
        />
      )}
    </div>
  );
}
