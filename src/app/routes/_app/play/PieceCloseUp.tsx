import { pieceCount } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { stackLayerItemIndex } from '@shared/play/pieceFlip';
import { tokenBoxRatio, visibleLayerCount } from '@shared/play/tableGeometry';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { card } from '@game/data/sizes';

import { PieceArtwork } from './multiplayer/PieceArtwork';
import { useTabletopSelector } from './TabletopContext';
import styles from './TabletopScene.module.css';

/** The published image a piece shows on top: the upper face of its top layer. */
export function topFaceHref(piece: TablePiece): string | undefined {
  if (piece.kind === 'marker' || piece.items.length === 0) {
    return undefined;
  }
  const shownLayers = visibleLayerCount(piece);
  const item = piece.items[stackLayerItemIndex(piece.items.length, shownLayers, shownLayers - 1, piece.flipRevision)];
  return item?.artwork?.[item.faceUp ? 'front' : 'back'];
}

const CARD_HEIGHT_PX = 380;
const TOKEN_SIZE_PX = 240;
const CURSOR_GAP_PX = 28;
const EDGE_PX = 12;

type Pointer = Readonly<{ x: number; y: number; alt: boolean }>;

/* Where the pointer is and whether Alt is held; a lost window or hidden page lets go of Alt. */
function useAltPointer(): Pointer {
  const [pointer, setPointer] = useState<Pointer>({ x: 0, y: 0, alt: false });
  /* The pointer is followed without rendering while Alt is up, so pressing Alt places the close-up where the pointer already is. */
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      last.current = { x: event.clientX, y: event.clientY };
      setPointer((current) =>
        current.alt || event.altKey ? { x: event.clientX, y: event.clientY, alt: event.altKey } : current
      );
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        /* Alt alone would otherwise focus the browser's menu bar on Windows and Linux. */
        event.preventDefault();
      }
      setPointer((current) => (current.alt === event.altKey ? current : { ...last.current, alt: event.altKey }));
    };
    const release = () => setPointer((current) => (current.alt ? { ...current, alt: false } : current));
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', release);
    };
  }, []);

  return pointer;
}

type Bounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** The close-up's box beside the pointer within the table's area, turned to the pointer's other side where the area would cut it off. */
function placeBeside(pointer: Pointer, width: number, height: number, bounds: Bounds) {
  const right = pointer.x + CURSOR_GAP_PX;
  const left = right + width + EDGE_PX > bounds.right ? pointer.x - CURSOR_GAP_PX - width : right;
  const top = Math.min(pointer.y - height / 2, bounds.bottom - height - EDGE_PX);
  return { left: Math.max(bounds.left + EDGE_PX, left), top: Math.max(bounds.top + EDGE_PX, top) };
}

/*
 * Holding Alt over a card or token shows its face flat and large beside the pointer, out of the table's perspective, the way it is printed.
 * It shows the face the table shows, so a face-down card shows its back.
 */
export function PieceCloseUp({ area }: Readonly<{ area: RefObject<HTMLElement | null> }>) {
  const pointer = useAltPointer();
  const piece = useTabletopSelector((table) =>
    table.hoveredPieceId ? (table.renderedPieces.find((entry) => entry.id === table.hoveredPieceId) ?? null) : null
  );
  const href = piece ? topFaceHref(piece) : undefined;
  if (!pointer.alt || !piece || !href) {
    return null;
  }
  const isCard = piece.kind === 'card';
  /* A disc token stays a disc, as it lies on the table. */
  const round = !isCard && tokenBoxRatio(piece) == null;
  const width = isCard ? Math.round((CARD_HEIGHT_PX * card.width) / card.height) : TOKEN_SIZE_PX;
  const height = isCard ? CARD_HEIGHT_PX : TOKEN_SIZE_PX;
  const count = pieceCount(piece);
  /* The table's area below the seated header, which lies over the canvas's top, rather than the window: the dock covers the rest. */
  const rect = area.current?.getBoundingClientRect();
  const header = area.current?.closest('.dune-play-shell')?.querySelector('.seated-header')?.getBoundingClientRect();
  const bounds = rect
    ? { left: rect.left, top: Math.max(rect.top, header?.bottom ?? 0), right: rect.right, bottom: rect.bottom }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const position = placeBeside(pointer, width, height + (count > 1 && !round ? 40 : 16), bounds);
  return (
    <div className={styles.closeUp} data-round={round || undefined} style={position} aria-hidden>
      <PieceArtwork
        piece={piece}
        src={href}
        name={piece.label}
        width={width}
        height={height}
        radius={round ? '50%' : '10px'}
      />
      {count > 1 ? <div className={styles.closeUpCount}>×{count}</div> : null}
    </div>
  );
}
