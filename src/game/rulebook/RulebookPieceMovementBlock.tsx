import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { rulebookSourceClipPath } from '@shared/rulebooks/sources';
import type { ComponentProps } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { RulebookBoardSceneVisual } from './RulebookBoardScene';
import { RulebookIllustratedStep } from './RulebookIllustratedStep';
import { RulebookPieceMovement } from './RulebookPieceMovement';
import { rulebookTroopArtwork } from './rulebookTroopArtwork';

type Movement = Extract<RulebookRenderBlockV1, { kind: 'piece-movement' }>;

function movementGroup(group: Movement['left']): ComponentProps<typeof RulebookPieceMovement>['left'] {
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

function MovementNote({ note }: Readonly<{ note: NonNullable<Movement['notes']>[number] }>) {
  const source = note.source;
  const imageUrl = useAsset(source.status === 'ready' ? source.imageUrl : '');
  return (
    <p className="rulebookMovementNote">
      <span>{note.label}</span>
      {source.status === 'ready' ? (
        <span className="rulebookMovementNotePieces">
          {Array.from({ length: note.count }, (_, index) => (
            <img key={index} src={imageUrl} alt={source.name} style={{ clipPath: rulebookSourceClipPath(source) }} />
          ))}
        </span>
      ) : source.status === 'unavailable' ? (
        <span>{note.count} pieces; source unavailable</span>
      ) : null}
    </p>
  );
}

/** Saved piece movements combine the supplied token groups, optional board state, and numbered explanation. */
export function RulebookPieceMovementBlock({ block }: Readonly<{ block: Movement }>) {
  return (
    <RulebookIllustratedStep
      anchor={block.anchor}
      blockId={block.id}
      step={block.step}
      title={block.title}
      caption={block.caption}
      outcome={block.outcome}
      visual={
        <div className="rulebookMovementVisual" data-with-board={Boolean(block.board) || undefined}>
          {block.board ? <RulebookBoardSceneVisual scene={block.board} /> : null}
          <div>
            <RulebookPieceMovement
              left={movementGroup(block.left)}
              right={movementGroup(block.right)}
              direction={block.direction === 'none' ? undefined : block.direction}
            />
            {block.notes?.length ? (
              <div className="rulebookMovementNotes">
                {block.notes.map((note) => (
                  <MovementNote key={note.id} note={note} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      }
    />
  );
}
