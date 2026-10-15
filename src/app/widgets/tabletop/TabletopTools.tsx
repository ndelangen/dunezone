import { Button } from '@mantine/core';
import { deletablePiece } from '@shared/play/commands';
import type { TablePiece } from '@shared/play/model';
import { hasHiddenFace, peeksWholeDeck } from '@shared/play/peeking';
import { isSpicePiece } from '@shared/play/spice';
import { isTroopStack } from '@shared/play/troop';
import { RadialMenu } from '@ui/control/RadialMenu';
import type { RadialAction } from '@ui/control/RadialMenu';
import type { RefObject } from 'react';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import { peekableToken } from './peekableToken';
import { PeekView } from './PeekView';
import { PieceCloseUp } from './PieceCloseUp';
import { pieceHasMenu } from './pieceMenu';
import { useTabletopReader, useTabletopSelector } from './TabletopContext';
import type { TabletopContextValue } from './TabletopContext';

export type PieceMenuAnchor = { pieceId: string; x: number; y: number; touch: boolean };

/* What deleting this piece takes away, in the hold's words. */
function deleteLabel(piece: TablePiece) {
  const count = piece.items.length;
  const unit =
    piece.kind === 'card' ? 'cards' : isSpicePiece(piece) ? 'spice' : isTroopStack(piece) ? 'troops' : 'tokens';
  const what = count > 1 ? `all ${count} ${unit} ` : '';
  return `Hold to delete ${what}permanently`;
}

type MenuControls = Pick<
  TabletopContextValue,
  'deckControls' | 'spiceReserveControls' | 'peekControls' | 'deleteControls'
>;

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

/* A deck's, a spice pile's or a token's actions as a ring at the pointer; it follows the live table while open, apart from the canvas. */
function PieceMenu({ pieceMenu, onClose }: Readonly<{ pieceMenu: PieceMenuAnchor | null; onClose: () => void }>) {
  const menuPiece = useTabletopSelector((table) =>
    pieceMenu ? table.state.pieces.find((piece) => piece.id === pieceMenu.pieceId) : undefined
  );
  const deckControls = useTabletopSelector((table) => (pieceMenu ? table.deckControls : undefined));
  const spiceReserveControls = useTabletopSelector((table) => (pieceMenu ? table.spiceReserveControls : undefined));
  const peekControls = useTabletopSelector((table) => (pieceMenu ? table.peekControls : undefined));
  const deleteControls = useTabletopSelector((table) => (pieceMenu ? table.deleteControls : undefined));
  const menuPieceReserved = useTabletopSelector((table) =>
    pieceMenu ? table.reservedPieceIds.has(pieceMenu.pieceId) : false
  );
  if (!pieceMenu || !menuPiece) {
    return null;
  }
  const spice = isSpicePiece(menuPiece);
  const deck = !spice && menuPiece.kind === 'card';
  const name = spice ? 'Spice actions' : deck ? 'Deck actions' : 'Token actions';
  const count = menuPiece.items.length;
  const hub = spice ? 'Spice' : deck ? `${count} card${count === 1 ? '' : 's'}` : 'Token';
  const peek = peekAction(menuPiece, peekControls, onClose);
  const actions: RadialAction[] = spice
    ? spiceActions(menuPiece, spiceReserveControls, onClose)
    : deck
      ? deckActions(menuPiece, deckControls, peek, pieceMenu.touch)
      : peekableToken(menuPiece)
        ? [peek]
        : [];
  if (deletablePiece(menuPiece)) {
    actions.push(deleteAction(menuPiece, deleteControls, menuPieceReserved, onClose));
  }
  return (
    <RadialMenu
      key={menuPiece.id}
      name={name}
      hub={hub}
      x={pieceMenu.x}
      y={pieceMenu.y}
      actions={actions}
      onClose={onClose}
    />
  );
}

/* Play's menus and close-up views load separately from the scene used by the homepage. */
export function TabletopTools({
  pieceMenu,
  onMenuChange,
  area,
  keyboardActionsClassName,
}: {
  pieceMenu: PieceMenuAnchor | null;
  onMenuChange: (menu: PieceMenuAnchor | null) => void;
  area: RefObject<HTMLDivElement | null>;
  keyboardActionsClassName: string;
}) {
  const readTable = useTabletopReader();
  const hasDraft = useTabletopSelector((table) => table.state.draftMove !== null);
  const selectedPieceId = useTabletopSelector((table) => table.state.selectedPieceId);
  return (
    <>
      <Button
        className={keyboardActionsClassName}
        disabled={hasDraft || !selectedPieceId}
        onClick={(event) => {
          const { state } = readTable();
          const piece = state.pieces.find((entry) => entry.id === state.selectedPieceId);
          if (!piece || !pieceHasMenu(piece)) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          onMenuChange({
            pieceId: piece.id,
            x: bounds.left,
            y: bounds.bottom,
            touch: (event.nativeEvent as Partial<PointerEvent>).pointerType === 'touch',
          });
        }}
      >
        Selected piece actions
      </Button>
      <PieceMenu pieceMenu={pieceMenu} onClose={() => onMenuChange(null)} />
      <PeekView />
      <PieceCloseUp area={area} />
    </>
  );
}
