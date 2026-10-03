import { Button, CloseButton } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { peeksWholeDeck } from '@shared/play/peeking';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';

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
  return item.artwork?.name ?? piece.label;
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

type PeekControls = NonNullable<ReturnType<typeof usePeekControls>>;

function usePeekControls() {
  return useTabletopSelector((table) => table.peekControls);
}

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
  /* The deck's cards when the press began; a draw or a rearrangement from elsewhere ends the carry. */
  deck: string;
};

/* A point on the screen in the row's own coordinates, which scroll with its content. */
function rowX(element: HTMLElement, clientX: number) {
  return clientX - element.getBoundingClientRect().left + element.scrollLeft;
}

/* Each card's centre along the row, in the row's own coordinates. */
function cardCenters(element: HTMLElement) {
  const left = element.getBoundingClientRect().left - element.scrollLeft;
  return [...element.children].map((child) => {
    const box = child.getBoundingClientRect();
    return box.left - left + box.width / 2;
  });
}

/* A held card near either edge of the row scrolls it that way. */
function scrollAtEdge(element: HTMLElement, clientX: number) {
  const bounds = element.getBoundingClientRect();
  if (clientX < bounds.left + EDGE_SCROLL_PX) {
    element.scrollLeft -= EDGE_SCROLL_STEP_PX;
  } else if (clientX > bounds.right - EDGE_SCROLL_PX) {
    element.scrollLeft += EDGE_SCROLL_STEP_PX;
  }
}

/* The shown order with one card moved, or nothing when either place is not in the deck. */
function movedOrder(order: readonly number[], from: number, to: number): number[] | null {
  const inDeck = (index: number) => index in order;
  if (from === to || !inDeck(from) || !inDeck(to)) {
    return null;
  }
  const shown = [...order];
  const [moved] = shown.splice(from, 1);
  shown.splice(to, 0, moved!);
  return shown;
}

/* The order the deck shows in: the order this viewer asked for, until the room's next frame for the deck replaces it. */
function useDeckOrder(piece: TablePiece, deck: string, peekControls: PeekControls | undefined) {
  const [pending, setPending] = useState<{ deck: string; order: number[] } | null>(null);
  const order = pending?.deck === deck ? pending.order : topFirst(piece.items.length);
  const move = (from: number, to: number) => {
    const shown = movedOrder(order, from, to);
    if (!shown || !peekControls) {
      return;
    }
    setPending({ deck, order: shown });
    /* The room takes the order bottom card first. */
    peekControls.arrange(piece.id, [...shown].reverse());
  };
  return { order, move };
}

/* A card carried along the row by the pointer, and where it would land if let go now. */
function useDeckCarry(row: RefObject<HTMLOListElement | null>, deck: string, move: (from: number, to: number) => void) {
  const [held, setHeld] = useState<Carry | null>(null);
  const carry = held?.deck === deck ? held : null;
  const target = carry?.moved ? sortTarget(carry.centers, carry.from, carry.x - carry.startX) : null;

  const press = (event: ReactPointerEvent<HTMLDivElement>, from: number) => {
    const element = row.current;
    if (event.button !== 0 || !element) {
      return;
    }
    /* No text selection and no native image drag: the card is carried by the pointer alone. */
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const centers = cardCenters(element);
    const x = rowX(element, event.clientX);
    const step = centers.length > 1 ? centers[1]! - centers[0]! : 0;
    setHeld({ pointerId: event.pointerId, from, startX: x, x, moved: false, centers, step, deck });
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = row.current;
    if (carry?.pointerId !== event.pointerId || !element) {
      return;
    }
    scrollAtEdge(element, event.clientX);
    const x = rowX(element, event.clientX);
    setHeld({ ...carry, x, moved: carry.moved || Math.abs(x - carry.startX) > DRAG_THRESHOLD_PX });
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (held?.pointerId !== event.pointerId) {
      return;
    }
    const landing = cancelled ? null : target;
    if (carry && landing !== null) {
      move(carry.from, landing);
    }
    setHeld(null);
  };

  return { carry, target, press, drag, release };
}

/* Left and right move a focused card one place along the row. */
function arrowStep(event: ReactKeyboardEvent) {
  return ({ ArrowLeft: -1, ArrowRight: 1 } as Partial<Record<string, number>>)[event.key] ?? 0;
}

type Placement = Readonly<{ held: boolean; shift: number; place: number }>;

/* Where a card shows while another may be carried: the held card under the pointer, the cards it passed one place aside. */
function placementOf(shownIndex: number, carry: Carry | null, target: number | null): Placement {
  if (!carry || target === null) {
    return { held: false, shift: 0, place: shownIndex };
  }
  if (carry.from === shownIndex) {
    return { held: true, shift: carry.x - carry.startX, place: target };
  }
  const shift = sortShift(shownIndex, carry.from, target, carry.step);
  return { held: false, shift, place: shownIndex + Math.sign(shift) };
}

type DeckCardProps = Readonly<{
  piece: TablePiece;
  stored: number;
  shownIndex: number;
  count: number;
  placement: Placement;
  carrying: ReturnType<typeof useDeckCarry>;
  move: (from: number, to: number) => void;
  peekControls: PeekControls | undefined;
}>;

function DeckCard({ piece, stored, shownIndex, count, placement, carrying, move, peekControls }: DeckCardProps) {
  const item = piece.items[stored]!;
  const { held, shift, place } = placement;
  return (
    <li
      className={styles.peekDeckCard}
      data-held={held || undefined}
      style={shift ? { transform: `translateX(${shift}px)` } : undefined}
    >
      <span className={styles.peekDeckPlace}>{placeName(place, count)}</span>
      {/* The card itself is the handle: drag it along the row, or move it with the arrow keys. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${cardName(piece, item)}, ${placeName(shownIndex, count)}. Arrow keys move it.`}
        className={styles.peekDeckHandle}
        onKeyDown={(event) => {
          const step = arrowStep(event);
          if (step) {
            event.preventDefault();
            move(shownIndex, shownIndex + step);
          }
        }}
        onPointerDown={(event) => peekControls && carrying.press(event, shownIndex)}
        onPointerMove={carrying.drag}
        onPointerUp={(event) => carrying.release(event)}
        onPointerCancel={(event) => carrying.release(event, true)}
        onLostPointerCapture={(event) => carrying.release(event, true)}
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
}

/*
 * A deck held open: its cards top first, in a row.
 * A card follows the pointer while it is held and the cards it passes slide aside straight away;
 * letting go puts it where the gap is. Pull out lays a card face down beside the deck.
 */
function DeckRow({ piece }: Readonly<{ piece: TablePiece }>) {
  const peekControls = usePeekControls();
  const row = useRef<HTMLOListElement>(null);
  /* The deck's cards as they stand, by id: another frame for the table leaves it as it was, while a change to the deck does not. */
  const deck = piece.items.map((item) => item.id).join(',');
  const { order, move } = useDeckOrder(piece, deck, peekControls);
  const carrying = useDeckCarry(row, deck, move);
  return (
    <ol
      ref={row}
      className={styles.peekDeck}
      aria-label={`${piece.label}, top card first`}
      data-sorting={carrying.carry?.moved || undefined}
    >
      {order.map((stored, shownIndex) => (
        <DeckCard
          key={piece.items[stored]!.id}
          piece={piece}
          stored={stored}
          shownIndex={shownIndex}
          count={order.length}
          placement={placementOf(shownIndex, carrying.carry, carrying.target)}
          carrying={carrying}
          move={move}
          peekControls={peekControls}
        />
      ))}
    </ol>
  );
}

/* Closing a peek: it hides at once, before the room's frame confirms it, and Escape inside it closes it too. */
function usePeekClosing(piece: TablePiece | undefined, peekControls: PeekControls | undefined) {
  const [closedId, setClosedId] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const open = !!piece && piece.id !== closedId;

  useEffect(() => {
    if (!piece) {
      setClosedId(null);
    }
  }, [piece]);
  useEffect(() => {
    if (open) {
      closeButton.current?.focus();
    }
  }, [open, piece?.id]);
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

  return { open, close, dialog, closeButton };
}

function PeekHeader({ piece, deck }: Readonly<{ piece: TablePiece; deck: boolean }>) {
  return (
    <div className={styles.peekHeader}>
      <div className={styles.peekTitle}>{deck ? `Looking through ${piece.label}` : `Peeking at ${piece.label}`}</div>
      <div className={styles.peekHint}>
        {deck
          ? 'Only you see these cards. Drag a card along the row to move it.'
          : 'Only you see this face. Everyone sees that you peeked.'}
      </div>
    </div>
  );
}

function SingleFace({ piece }: Readonly<{ piece: TablePiece }>) {
  return (
    <div className={styles.peekSingle}>
      <Face piece={piece} item={piece.items.at(-1)!} height={piece.kind === 'card' ? CARD_HEIGHT_PX : TOKEN_SIZE_PX} />
    </div>
  );
}

/**
 * What this viewer's faction is peeking at, shown to it alone: a card or token's hidden face, or a whole deck to rearrange.
 * The room sends the faces only in this faction's own frames;
 * everyone else sees on the piece who peeked.
 */
export function PeekView() {
  const piece = useTabletopSelector((table) => table.peek)?.piece;
  const peekControls = usePeekControls();
  const { open, close, dialog, closeButton } = usePeekClosing(piece, peekControls);
  if (!open || !piece) {
    return null;
  }
  const deck = peeksWholeDeck(piece);
  return (
    <div ref={dialog} className={styles.peek} role="dialog" aria-label={`Peeking at ${piece.label}`}>
      <PeekHeader piece={piece} deck={deck} />
      <CloseButton ref={closeButton} className={styles.peekClose} aria-label="Stop peeking" onClick={close} />
      {deck ? <DeckRow piece={piece} /> : <SingleFace piece={piece} />}
    </div>
  );
}
