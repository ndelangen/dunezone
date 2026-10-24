import { deletablePiece } from '@shared/play/commands';
import type { TablePiece } from '@shared/play/model';
import { hasHiddenFace, peeksWholeDeck } from '@shared/play/peeking';
import { isSpicePiece } from '@shared/play/spice';
import { isTroopStack } from '@shared/play/troop';
import type { RadialAction } from '@ui/control/RadialMenu';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import { peekableToken } from './peekableToken';
import type { TabletopContextValue } from './TabletopContext';

/* The ring's items for a piece, from the controls the table hands out while this viewer can act. */

export type MenuControls = Pick<
  TabletopContextValue,
  'deckControls' | 'spiceReserveControls' | 'peekControls' | 'deleteControls' | 'handControls'
>;

type MenuOptions = Readonly<{
  /** Another player holds the piece, so it cannot be deleted from under them. */
  reserved: boolean;
  /** A ring opened by a finger has no keyboard to teach. */
  touch: boolean;
  onClose: () => void;
}>;

/* What deleting this piece takes away, in the hold's words. */
function deleteLabel(piece: TablePiece) {
  const count = piece.items.length;
  const unit =
    piece.kind === 'card' ? 'cards' : isSpicePiece(piece) ? 'spice' : isTroopStack(piece) ? 'troops' : 'tokens';
  const what = count > 1 ? `all ${count} ${unit} ` : '';
  return `Hold to delete ${what}permanently`;
}

/* Peeking at a deck's or a hidden token's faces; it closes the ring, since the peek opens its own view. */
function peekAction(piece: TablePiece, peekControls: MenuControls['peekControls'], onClose: () => void): RadialAction {
  const available = !!peekControls && !piece.inventory && !piece.battleOverlay && hasHiddenFace(piece);
  return {
    key: 'peek',
    label: peeksWholeDeck(piece) ? 'Peek at the deck' : 'Peek',
    icon: 'peek',
    disabled: !available,
    onSelect: () => {
      peekControls?.peek(piece.id);
      onClose();
    },
  };
}

/* Taking a spice pile into the reserve. */
function spiceActions(
  piece: TablePiece,
  spiceReserveControls: MenuControls['spiceReserveControls'],
  onClose: () => void
): RadialAction[] {
  return [
    {
      key: 'reserve',
      label: 'Take into spice reserve',
      icon: 'reserve',
      disabled: !spiceReserveControls || piece.locked || !spiceReserveControls.canCollect(piece.id),
      onSelect: () => {
        spiceReserveControls?.collect(piece.id);
        onClose();
      },
    },
  ];
}

/* A deck's draw, deal and shuffle after its peek; the ring stays open so a deck can be dealt from again. */
function deckActions(
  piece: TablePiece,
  deckControls: MenuControls['deckControls'],
  peek: RadialAction,
  touch: boolean
): RadialAction[] {
  const count = piece.items.length;
  const available = !!deckControls && !piece.locked && !piece.inventory && count > 0;
  return [
    peek,
    {
      key: 'draw',
      label: 'Draw a card',
      icon: 'draw',
      disabled: !available,
      onSelect: () => deckControls?.draw(piece.id),
    },
    {
      key: 'deal',
      label: 'Deal a card',
      targetsLabel: 'Deal 1 card to…',
      icon: 'deal',
      disabled: !available || !deckControls?.recipients.length,
      targets: (deckControls?.recipients ?? []).map((faction) => ({
        key: faction.id,
        label: `Deal 1 to ${faction.name}`,
        name: faction.name,
        face: faction.artwork ? (
          <FactionToken logo={faction.artwork.logo} background={faction.artwork.background} />
        ) : (
          faction.name.slice(0, 2)
        ),
        disabled: !available,
        onSelect: () => deckControls?.draw(piece.id, faction.id),
      })),
    },
    {
      key: 'shuffle',
      label: 'Shuffle',
      icon: 'shuffle',
      /* Hovering a deck and pressing R shuffles it; a ring opened by a finger has no keyboard to teach. */
      shortcut: touch ? undefined : 'R',
      disabled: !available || count < 2,
      onSelect: () => deckControls?.shuffle(piece.id),
    },
  ];
}

/* Taking a loose card or a battle leader into the hand, as the classic controls' button does; it closes the ring, since the piece leaves the table. */
function handAction(
  piece: TablePiece,
  handControls: NonNullable<MenuControls['handControls']>,
  onClose: () => void
): RadialAction {
  return {
    key: 'hand',
    label: 'Take into hand',
    icon: 'hand',
    onSelect: () => {
      handControls.take(piece.id);
      onClose();
    },
  };
}

/* Deleting a piece for good, held so a slip cannot do it; a reserved or locked piece stays. */
function deleteAction(
  piece: TablePiece,
  deleteControls: MenuControls['deleteControls'],
  reserved: boolean,
  onClose: () => void
): RadialAction {
  return {
    key: 'delete',
    label: deleteLabel(piece),
    icon: 'delete',
    held: true,
    disabled: !deleteControls?.remove || reserved || piece.locked,
    onSelect: () => {
      deleteControls?.remove(piece.id);
      onClose();
    },
  };
}

/* The piece's own actions: a spice pile's, a deck's, or a hidden token's peek. */
function ownActions(piece: TablePiece, controls: MenuControls, touch: boolean, onClose: () => void): RadialAction[] {
  if (isSpicePiece(piece)) {
    return spiceActions(piece, controls.spiceReserveControls, onClose);
  }
  const peek = peekAction(piece, controls.peekControls, onClose);
  if (piece.kind === 'card') {
    return deckActions(piece, controls.deckControls, peek, touch);
  }
  return peekableToken(piece) ? [peek] : [];
}

/**
 * Every item on a piece's ring, in the ring's order.
 * The piece's own actions come first, then the hand's take where the piece can be taken, and last the held delete where the piece can be deleted.
 */
export function pieceMenuActions(piece: TablePiece, controls: MenuControls, options: MenuOptions): RadialAction[] {
  const actions = ownActions(piece, controls, options.touch, options.onClose);
  if (controls.handControls?.canTake(piece.id)) {
    actions.push(handAction(piece, controls.handControls, options.onClose));
  }
  if (deletablePiece(piece)) {
    actions.push(deleteAction(piece, controls.deleteControls, options.reserved, options.onClose));
  }
  return actions;
}
