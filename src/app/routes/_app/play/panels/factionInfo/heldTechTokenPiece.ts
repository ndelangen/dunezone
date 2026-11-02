import type { TablePiece } from '@shared/play/model';
import type { HeldTechToken } from '@shared/play/techToken';

/* The name a face-down token goes by, which says what it is and nothing of its face. */
const FACE_DOWN = 'Face-down tech token';

/**
 * A held tech token as a piece the panel's artwork, tooltip and Alt close-up read, named by where it is held rather than by any piece on the table.
 * A face-down one shows its back.
 */
export function heldTechTokenPiece(token: HeldTechToken, factionId: string, index: number): TablePiece {
  const id = `${factionId}-held-tech-${index}`;
  const faceUp = token.front !== undefined;
  return {
    id,
    label: token.name ?? FACE_DOWN,
    owner: factionId,
    color: '#000000',
    accent: '#000000',
    items: [
      {
        id: `${id}-item`,
        faceUp,
        artwork: {
          back: token.back,
          type: 'token-tech',
          name: token.name ?? FACE_DOWN,
          ...(token.front ? { front: token.front } : {}),
          ...(token.description ? { description: token.description } : {}),
          ...(token.size ? { size: token.size } : {}),
        },
      },
    ],
    stackKey: null,
    position: [0, 0, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'force',
  };
}
