import { Button } from '@mantine/core';
import { isSpicePiece } from '@shared/play/spice';
import { RadialMenu } from '@ui/control/RadialMenu';
import type { RefObject } from 'react';

import { PeekView } from './PeekView';
import { PieceCloseUp } from './PieceCloseUp';
import { pieceHasMenu } from './pieceMenu';
import { pieceMenuActions } from './pieceMenuActions';
import { useTabletopReader, useTabletopSelector } from './TabletopContext';

export type PieceMenuAnchor = { pieceId: string; x: number; y: number; touch: boolean };

/* A deck's, a spice pile's or a token's actions as a ring at the pointer; it follows the live table while open, apart from the canvas. */
function PieceMenu({ pieceMenu, onClose }: Readonly<{ pieceMenu: PieceMenuAnchor | null; onClose: () => void }>) {
  const menuPiece = useTabletopSelector((table) =>
    pieceMenu ? table.state.pieces.find((piece) => piece.id === pieceMenu.pieceId) : undefined
  );
  const deckControls = useTabletopSelector((table) => (pieceMenu ? table.deckControls : undefined));
  const spiceReserveControls = useTabletopSelector((table) => (pieceMenu ? table.spiceReserveControls : undefined));
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
    { deckControls, spiceReserveControls, peekControls, deleteControls, handControls },
    { reserved: menuPieceReserved, touch: pieceMenu.touch, onClose }
  );
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
