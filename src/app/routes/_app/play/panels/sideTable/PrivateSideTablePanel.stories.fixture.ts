import type { TablePiece } from '@shared/play/model';
import { fn } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { PrivateSideTablePanel } from './PrivateSideTablePanel';
import type { PrivateSideTablePanelProps } from './PrivateSideTablePanel';

/* The viewer's hand in a game in play, with the loose Treachery card drawn into it. */
function heldPieces(): TablePiece[] {
  const snapshot = playingSnapshot();
  const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
  return [...snapshot.hand!, { ...card, owner: snapshot.bank!.factionId }];
}

/** The hand with the Treachery card laid on the side-table, and a leader set on it turned a quarter. */
function laidOut(): TablePiece[] {
  const hand = heldPieces();
  const leader = hand.find((piece) => piece.kind !== 'card')!;
  return hand.map((piece) => {
    if (piece.id === 'treachery-card-loose') {
      return { ...piece, hiddenZone: { x: 0.3, y: 0.5 } };
    }
    return piece === leader ? { ...piece, hiddenZone: { x: 0.62, y: 0.45, turn: 6 } } : piece;
  });
}

export const sideTablePanelMeta = {
  ...panelMeta(PANEL_WINDOWS.sideTable),
  component: PrivateSideTablePanel,
  args: {
    hand: laidOut(),
    enabled: true,
    onLay: fn((_pieceId: string) => 'story-command'),
    awaiting: () => false,
    onPlace: fn(),
  } satisfies PrivateSideTablePanelProps,
};

/** The hand with nothing laid on the side-table yet. */
export const nothingLaid = heldPieces;
