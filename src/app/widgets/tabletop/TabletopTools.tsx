import { Button, Menu } from '@mantine/core';
import { hasHiddenFace, peeksWholeDeck } from '@shared/play/peeking';
import { isSpicePiece } from '@shared/play/spice';
import { Undo2 } from 'lucide-react';
import { useId } from 'react';
import type { RefObject } from 'react';

import { deckShuffleHint } from './longPress';
import { peekableToken } from './peekableToken';
import { PeekView } from './PeekView';
import { PieceCloseUp } from './PieceCloseUp';
import { useTabletopReader, useTabletopSelector } from './TabletopContext';

export type PieceMenuAnchor = { pieceId: string; x: number; y: number; touch: boolean };

/* A deck's or a spice pile's menu, opened from the piece; it follows the live table while open, apart from the canvas. */
function PieceMenu({ pieceMenu, onClose }: Readonly<{ pieceMenu: PieceMenuAnchor | null; onClose: () => void }>) {
  const menuPiece = useTabletopSelector((table) =>
    pieceMenu ? table.state.pieces.find((piece) => piece.id === pieceMenu.pieceId) : undefined
  );
  const deckControls = useTabletopSelector((table) => (pieceMenu ? table.deckControls : undefined));
  const spiceReserveControls = useTabletopSelector((table) => (pieceMenu ? table.spiceReserveControls : undefined));
  const peekControls = useTabletopSelector((table) => (pieceMenu ? table.peekControls : undefined));
  const pieceMenuName = isSpicePiece(menuPiece)
    ? 'Spice actions'
    : menuPiece?.kind === 'card'
      ? 'Deck actions'
      : 'Token actions';
  const peekAvailable =
    !!peekControls && !!menuPiece && !menuPiece.inventory && !menuPiece.battleOverlay && hasHiddenFace(menuPiece);
  const peekItem = menuPiece && (
    <Menu.Item
      disabled={!peekAvailable}
      onClick={() => {
        peekControls?.peek(menuPiece.id);
        onClose();
      }}
    >
      {peeksWholeDeck(menuPiece) ? 'Peek at the deck' : 'Peek'}
    </Menu.Item>
  );
  const pieceMenuLabelId = useId();
  const deckAvailable =
    !!deckControls && !!menuPiece && !menuPiece.locked && !menuPiece.inventory && menuPiece.items.length > 0;
  const shuffleHint = deckShuffleHint(pieceMenu?.touch ?? false);
  return (
    <Menu
      opened={!!pieceMenu && !!menuPiece}
      onChange={(opened) => {
        if (!opened) {
          onClose();
        }
      }}
      closeOnItemClick={false}
      withinPortal
      position="bottom-start"
    >
      <Menu.Target>
        {/* An empty positioning anchor, not a control: hidden from assistive technology, so Mantine's expanded state on it names nothing. */}
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: pieceMenu?.x ?? 0,
            top: pieceMenu?.y ?? 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      </Menu.Target>
      {/* Mantine names the dropdown by its target, here an empty anchor, so the menu points its name at its own hidden label instead. */}
      <Menu.Dropdown aria-labelledby={pieceMenuLabelId}>
        <span id={pieceMenuLabelId} hidden>
          {pieceMenuName}
        </span>
        {isSpicePiece(menuPiece) ? (
          <Menu.Item
            disabled={!spiceReserveControls || menuPiece.locked || !spiceReserveControls.canCollect(menuPiece.id)}
            onClick={() => {
              spiceReserveControls?.collect(menuPiece.id);
              onClose();
            }}
          >
            Take into spice reserve
          </Menu.Item>
        ) : menuPiece && menuPiece.kind !== 'card' ? (
          peekItem
        ) : (
          <>
            <Menu.Label>{menuPiece ? `${menuPiece.items.length} cards` : 'Deck empty'}</Menu.Label>
            {peekItem}
            <Menu.Item disabled={!deckAvailable} onClick={() => pieceMenu && deckControls?.draw(pieceMenu.pieceId)}>
              Draw a card
            </Menu.Item>
            {deckControls?.recipients.map((faction) => (
              <Menu.Item
                key={faction.id}
                disabled={!deckAvailable}
                onClick={() => pieceMenu && deckControls.draw(pieceMenu.pieceId, faction.id)}
              >
                Deal 1 to {faction.name}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item
              disabled={!deckAvailable || (menuPiece?.items.length ?? 0) < 2}
              onClick={() => pieceMenu && deckControls?.shuffle(pieceMenu.pieceId)}
            >
              Shuffle
            </Menu.Item>
            {shuffleHint && <Menu.Label>{shuffleHint}</Menu.Label>}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/* Play's menus and close-up views load separately from the scene used by the homepage. */
export function TabletopTools({
  pieceMenu,
  onMenuChange,
  area,
  keyboardActionsClassName,
  undoClassName,
}: {
  pieceMenu: PieceMenuAnchor | null;
  onMenuChange(menu: PieceMenuAnchor | null): void;
  area: RefObject<HTMLDivElement | null>;
  keyboardActionsClassName: string;
  undoClassName: string;
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
          if (!piece || piece.inventory || (piece.kind !== 'card' && !isSpicePiece(piece) && !peekableToken(piece))) {
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
      <UndoButton className={undoClassName} />
      <PieceMenu pieceMenu={pieceMenu} onClose={() => onMenuChange(null)} />
      <PeekView />
      <PieceCloseUp area={area} />
    </>
  );
}

/* The same key on every platform's keyboard: Cmd on a Mac, Ctrl elsewhere. */
const undoShortcut = () => (/Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⌘Z' : 'Ctrl+Z');

/* Shown only while the player's last move can still be taken back, which is also when Ctrl+Z does it. */
function UndoButton({ className }: Readonly<{ className: string }>) {
  const undo = useTabletopSelector((table) => table.undo);
  if (!undo) {
    return null;
  }
  return (
    <Button
      className={className}
      variant="default"
      size="compact-md"
      leftSection={<Undo2 size={16} aria-hidden />}
      onClick={undo}
      aria-keyshortcuts="Control+Z Meta+Z"
    >
      Undo move · {undoShortcut()}
    </Button>
  );
}
