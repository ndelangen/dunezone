import { Button } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { peeksWholeDeck } from '@shared/play/peeking';
import { useCallback, useEffect, useRef, useState } from 'react';

import { card } from '@game/data/sizes';

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

/*
 * A deck held open: its cards top first, in a row. Dragging a card onto another puts it in that card's place,
 * and Pull out lays a card face down beside the deck.
 */
function DeckRow({ piece }: Readonly<{ piece: TablePiece }>) {
  const peekControls = useTabletopSelector((table) => table.peekControls);
  /* The order this viewer asked for, shown until the room's next frame for the deck replaces it. */
  const [pending, setPending] = useState<{ items: TablePiece['items']; order: number[] } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const order = pending?.items === piece.items ? pending.order : topFirst(piece.items.length);

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

  return (
    <ol className={styles.peekDeck} aria-label={`${piece.label}, top card first`}>
      {order.map((stored, shownIndex) => {
        const item = piece.items[stored]!;
        return (
          <li key={item.id} className={styles.peekDeckCard} data-dragging={dragging === shownIndex || undefined}>
            <span className={styles.peekDeckPlace}>{placeName(shownIndex, order.length)}</span>
            {/* The card itself is the handle: drag it onto another card, or move it with the arrow keys. */}
            <div
              role="button"
              tabIndex={0}
              aria-label={`${cardName(piece, item)}, ${placeName(shownIndex, order.length)}. Arrow keys move it.`}
              className={styles.peekDeckHandle}
              draggable={!!peekControls}
              onKeyDown={(event) => {
                const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
                const to = shownIndex + step;
                if (step && to >= 0 && to < order.length) {
                  event.preventDefault();
                  move(shownIndex, to);
                }
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(shownIndex));
                setDragging(shownIndex);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                if (dragging !== null) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) {
                  move(dragging, shownIndex);
                }
                setDragging(null);
              }}
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
              ? 'Only you see these cards. Drag a card onto another to move it there.'
              : 'Only you see this face. Everyone sees that you peeked.'}
          </div>
        </div>
        <Button ref={done} size="xs" variant="light" onClick={close}>
          Done
        </Button>
      </div>
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
