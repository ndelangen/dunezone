import type { Relation } from '@shared/play/alliances';
import { isBattleLeader } from '@shared/play/battle';
import { deletablePiece } from '@shared/play/commands';
import { isFactionToken } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { isSpicePiece } from '@shared/play/spice';

import { peekableToken } from './peekableToken';

/** What the viewer may do about the faction a token stands for, as the table offers it. */
export type AllianceRelations = Readonly<{ relation: (pieceId: string) => Relation | null }>;

/*
 * Whether right-clicking a piece opens its menu: cards, spice, hidden tokens, battle leaders (which go back to the
 * hand), a faction token while the viewer has an alliance action about it (#2978), and anything that can be taken out of the game.
 */
export function pieceHasMenu(piece: TablePiece, alliances?: AllianceRelations) {
  if (piece.inventory) {
    return false;
  }
  return (
    piece.kind === 'card' ||
    isSpicePiece(piece) ||
    peekableToken(piece) ||
    isBattleLeader(piece) ||
    (isFactionToken(piece) && Boolean(alliances?.relation(piece.id))) ||
    deletablePiece(piece)
  );
}

type MenuSources = Readonly<
  Partial<
    Record<'deckControls' | 'spiceReserveControls' | 'peekControls' | 'deleteControls' | 'allianceControls', unknown>
  >
>;

/** Whether the table offers any piece menu at all: one of the controls a menu acts through is there. */
export function offersPieceMenus(table: MenuSources) {
  return [
    table.deckControls,
    table.spiceReserveControls,
    table.peekControls,
    table.deleteControls,
    table.allianceControls,
  ].some(Boolean);
}
