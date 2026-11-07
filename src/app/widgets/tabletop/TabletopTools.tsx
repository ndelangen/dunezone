import { isSpicePiece } from '@shared/play/spice';
import { LabeledAction } from '@ui/control/LabeledAction';
import { RadialMenu } from '@ui/control/RadialMenu';
import { Ellipsis } from 'lucide-react';
import type { RefObject } from 'react';

import { PeekView } from './PeekView';
import { PieceCloseUp } from './PieceCloseUp';
import { pieceHasMenu } from './pieceMenu';
import { pieceMenuActions } from './pieceMenuActions';
import { useTabletopCommands, useTabletopReader, useTabletopSelector } from './TabletopContext';

export type PieceMenuAnchor = { pieceId: string; x: number; y: number };

/* A deck's, a spice pile's or a token's actions as a ring at the pointer; it follows the live table while open, apart from the canvas. */
function PieceMenu({ pieceMenu, onClose }: Readonly<{ pieceMenu: PieceMenuAnchor | null; onClose: () => void }>) {
  const menuPiece = useTabletopSelector((table) =>
    pieceMenu ? table.state.pieces.find((piece) => piece.id === pieceMenu.pieceId) : undefined
  );
  const deckControls = useTabletopSelector((table) => (pieceMenu ? table.deckControls : undefined));
  const spiceReserveControls = useTabletopSelector((table) => (pieceMenu ? table.spiceReserveControls : undefined));
  const spiceBlowControls = useTabletopSelector((table) => (pieceMenu ? table.spiceBlowControls : undefined));
  const peekControls = useTabletopSelector((table) => (pieceMenu ? table.peekControls : undefined));
  const deleteControls = useTabletopSelector((table) => (pieceMenu ? table.deleteControls : undefined));
  const handControls = useTabletopSelector((table) => (pieceMenu ? table.handControls : undefined));
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
  const actions = pieceMenuActions(
    menuPiece,
    { deckControls, spiceReserveControls, spiceBlowControls, peekControls, deleteControls, handControls },
    { reserved: menuPieceReserved, onClose }
  );
  /* A leader or a tech token may offer only Take into hand, which a viewer who cannot act does not get; then there is no ring to show. */
  if (actions.length === 0) {
    return null;
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

/*
 * Spice let go over another faction's token waits over it in hand, and this ring asks what it is: a bribe, set on that
 * faction's bribe pile, or a payment straight into its spice reserve. Closing the ring puts the spice back where it came from.
 */
function SpiceGiftMenu() {
  const gift = useTabletopSelector((table) => table.spiceGift);
  const { giveSpice, cancelDraft } = useTabletopCommands();
  if (!gift) {
    return null;
  }
  const amount = `${gift.amount} spice`;
  return (
    <RadialMenu
      key={`${gift.factionId}:${gift.x}:${gift.y}`}
      name={`Give ${amount} to ${gift.name}`}
      hub={`${amount} to ${gift.name}`}
      x={gift.x}
      y={gift.y}
      actions={[
        {
          key: 'bribe',
          label: `Bribe ${gift.name}: onto its bribe pile`,
          icon: 'bribe',
          onSelect: () => giveSpice('bribe'),
        },
        {
          key: 'payment',
          label: `Pay ${gift.name}: into its spice reserve`,
          icon: 'pay',
          onSelect: () => giveSpice('payment'),
        },
      ]}
      onClose={cancelDraft}
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
      {/* Shown on keyboard focus only, so while there is nothing to act on it leaves the tab order altogether. */}
      {hasDraft || !selectedPieceId ? null : (
        <LabeledAction
          className={keyboardActionsClassName}
          icon={<Ellipsis size={16} />}
          onClick={(event) => {
            const { state } = readTable();
            const piece = state.pieces.find((entry) => entry.id === state.selectedPieceId);
            if (!piece || !pieceHasMenu(piece)) {
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            onMenuChange({ pieceId: piece.id, x: bounds.left, y: bounds.bottom });
          }}
        >
          Selected piece actions
        </LabeledAction>
      )}
      <PieceMenu pieceMenu={pieceMenu} onClose={() => onMenuChange(null)} />
      <SpiceGiftMenu />
      <PeekView />
      <PieceCloseUp area={area} />
    </>
  );
}
