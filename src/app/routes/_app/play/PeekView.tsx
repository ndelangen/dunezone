import { Button, CloseButton } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { peeksWholeDeck } from '@shared/play/peeking';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { card } from '@game/data/sizes';

import { sortShift, sortTarget } from './deckSort';
import { PieceArtwork } from './multiplayer/PieceArtwork';
import { useTabletopSelector } from './TabletopContext';
import styles from './TabletopScene.module.css';

const CARD_HEIGHT_PX = 340;
const DECK_CARD_HEIGHT_PX = 210;
const TOKEN_SIZE_PX = 240;

const widthFor = (height: number) => Math.round((height * card.width) / card.height);

/* One card or token of the peeked piece, alone, so its artwork finds its own prediction overlay. */
function itemPiece(piece: TablePiece, item: TablePiece['items'][number]): TablePiece {
  return { ...piece, items: [item] };
}

function cardName(piece: TablePiece, item: TablePiece['items'][number]) {
  return item.artwork && 'name' in item.artwork && item.artwork.name ? item.artwork.name : piece.label;
}

/* Where a card sits in the deck as shown, top first. */
function placeName(index: number, count: number) {
  return index === 0 ? 'Top' : index === count - 1 ? 'Bottom' : String(index + 1);
}

function Face({
  piece,
  item,
  height,
}: Readonly<{ piece: TablePiece; item: TablePiece['items'][number]; height: number }>) {
  const isCard = piece.kind === 'card';
  const src = item.artwork?.front ?? item.artwork?.back ?? null;
  const name = cardName(piece, item);
  return (
    <PieceArtwork
      piece={itemPiece(piece, item)}
      src={src}
      name={name}
      width={isCard ? widthFor(height) : height}
      height={height}
      radius="10px"
    />
  );
}

/* The order a deck shows in, top card first, as indices into its stored order, which runs bottom card first. */
const topFirst = (count: number) => Array.from({ length: count }, (_, index) => count - 1 - index);

/* Distance the pointer moves before a press on a card becomes a carry. */
const DRAG_THRESHOLD_PX = 4;
/* How near the row's edge the held card scrolls the row, and how far each move scrolls it. */
const EDGE_SCROLL_PX = 48;
const EDGE_SCROLL_STEP_PX = 14;

type Carry = {
  pointerId: number;
  from: number;
  /* Where the press began, in the row's own coordinates, so scrolling the row does not move the card off the pointer. */
  startX: number;
  x: number;
  moved: boolean;
  /* Each card's centre in the row's coordinates, and the distance between neighbouring cards, measured when the press began. */
  centers: number[];
  step: number;
};

/*
 * A deck held open: its cards top first, in a row.
 * A card follows the pointer while it is held and the cards it passes slide aside straight away;
 * letting go puts it where the gap is. Pull out lays a card face down beside the deck.
 */
function DeckRow({ piece }: Readonly<{ piece: TablePiece }>) {
  const peekControls = useTabletopSelector((table) => table.peekControls);
  const row = useRef<HTMLOListElement>(null);
  /* The order this viewer asked for, shown until the room's next frame for the deck replaces it. */
  const [pending, setPending] = useState<{ items: TablePiece['items']; order: number[] } | null>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const order = pending?.items === piece.items ? pending.order : topFirst(piece.items.length);
  const target = carry?.moved ? sortTarget(carry.centers, carry.from, carry.x - carry.startX) : null;

  const move = (from: number, to: number) => {
    if (from === to || !peekControls) {
      return;
    }
    const shown = [...order];
    const [moved] = shown.splice(from, 1);
    shown.splice(to, 0, moved!);
    setPending({ items: piece.items, order: shown });
    /* The room takes the order bottom card first. */
    peekControls.arrange(piece.id, [...shown].reverse());
  };

  /* A point on the screen in the row's own coordinates, which scroll with its content. */
  const rowX = (clientX: number) => {
    const element = row.current!;
    return clientX - element.getBoundingClientRect().left + element.scrollLeft;
  };

  const press = (event: ReactPointerEvent<HTMLDivElement>, from: number) => {
    const element = row.current;
    if (event.button !== 0 || !peekControls || !element) {
      return;
    }
    /* No text selection and no native image drag: the card is carried by the pointer alone. */
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const left = element.getBoundingClientRect().left - element.scrollLeft;
    const centers = [...element.children].map((child) => {
      const box = child.getBoundingClientRect();
      return box.left - left + box.width / 2;
    });
    const x = rowX(event.clientX);
    setCarry({
      pointerId: event.pointerId,
      from,
      startX: x,
      x,
      moved: false,
      centers,
      step: centers.length > 1 ? centers[1]! - centers[0]! : 0,
    });
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = row.current;
    if (!carry || event.pointerId !== carry.pointerId || !element) {
      return;
    }
    const bounds = element.getBoundingClientRect();
    if (event.clientX < bounds.left + EDGE_SCROLL_PX) {
      element.scrollLeft -= EDGE_SCROLL_STEP_PX;
    } else if (event.clientX > bounds.right - EDGE_SCROLL_PX) {
      element.scrollLeft += EDGE_SCROLL_STEP_PX;
    }
    const x = rowX(event.clientX);
    setCarry({ ...carry, x, moved: carry.moved || Math.abs(x - carry.startX) > DRAG_THRESHOLD_PX });
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!carry || event.pointerId !== carry.pointerId) {
      return;
    }
    if (!cancelled && target !== null) {
      move(carry.from, target);
    }
    setCarry(null);
  };

  return (
    <ol
      ref={row}
      className={styles.peekDeck}
      aria-label={`${piece.label}, top card first`}
      data-sorting={carry?.moved || undefined}
    >
      {order.map((stored, shownIndex) => {
        const item = piece.items[stored]!;
        const held = carry?.moved && carry.from === shownIndex;
        const shift = held
          ? carry.x - carry.startX
          : carry && target !== null
            ? sortShift(shownIndex, carry.from, target, carry.step)
            : 0;
        /* The place a card will have if the held card is let go now, which its label shows. */
        const place = held ? target! : shownIndex + Math.sign(shift);
        return (
          <li
            key={item.id}
            className={styles.peekDeckCard}
            data-held={held || undefined}
            style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          >
            <span className={styles.peekDeckPlace}>{placeName(place, order.length)}</span>
            {/* The card itself is the handle: drag it along the row, or move it with the arrow keys. */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`${cardName(piece, item)}, ${placeName(shownIndex, order.length)}. Arrow keys move it.`}
              className={styles.peekDeckHandle}
              onKeyDown={(event) => {
                const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
                const to = shownIndex + step;
                if (step && to >= 0 && to < order.length) {
                  event.preventDefault();
                  move(shownIndex, to);
                }
              }}
              onPointerDown={(event) => press(event, shownIndex)}
              onPointerMove={drag}
              onPointerUp={(event) => release(event)}
              onPointerCancel={(event) => release(event, true)}
              onLostPointerCapture={(event) => release(event, true)}
            >
              <Face piece={piece} item={item} height={DECK_CARD_HEIGHT_PX} />
            </div>
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={!peekControls}
              onClick={() => peekControls?.pull(piece.id, stored)}
            >
              Pull out
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What this viewer's faction is peeking at, shown to it alone: a card or token's hidden face, or a whole deck to rearrange.
 * The room sends the faces only in this faction's own frames;
 * everyone else sees on the piece who peeked.
 */
export function PeekView() {
  const peek = useTabletopSelector((table) => table.peek);
  const peekControls = useTabletopSelector((table) => table.peekControls);
  const done = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  /* A closed peek hides at once, before the room's frame confirms it. */
  const [closedId, setClosedId] = useState<string | null>(null);
  const piece = peek?.piece;
  const open = !!piece && piece.id !== closedId;

  useEffect(() => {
    if (!peek) {
      setClosedId(null);
    }
  }, [peek]);
  useEffect(() => {
    if (open) {
      done.current?.focus();
    }
  }, [open, piece?.id]);
  /* Escape inside the peek closes it; the table's own keys never reach a focused button here. */
  const close = useCallback(() => {
    if (piece) {
      setClosedId(piece.id);
      peekControls?.close();
    }
  }, [piece, peekControls]);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    element.addEventListener('keydown', onKey);
    return () => element.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !piece) {
    return null;
  }
  const deck = peeksWholeDeck(piece);
  const top = piece.items.at(-1)!;
  return (
    <div ref={dialog} className={styles.peek} role="dialog" aria-label={`Peeking at ${piece.label}`}>
      <div className={styles.peekHeader}>
        <div>
          <div className={styles.peekTitle}>
            {deck ? `Looking through ${piece.label}` : `Peeking at ${piece.label}`}
          </div>
          <div className={styles.peekHint}>
            {deck
              ? 'Only you see these cards. Drag a card along the row to move it.'
              : 'Only you see this face. Everyone sees that you peeked.'}
          </div>
        </div>
      </div>
      <CloseButton ref={done} className={styles.peekClose} aria-label="Stop peeking" onClick={close} />
      {deck ? (
        <DeckRow piece={piece} />
      ) : (
        <div className={styles.peekSingle}>
          <Face piece={piece} item={top} height={piece.kind === 'card' ? CARD_HEIGHT_PX : TOKEN_SIZE_PX} />
        </div>
      )}
    </div>
  );
}
