import { HoverCard, Portal } from '@mantine/core';
import { publishedThumbnailSrc } from '@shared/asset-publishing/publishedThumbnail';
import { useTouchSurface } from '@ui/surface/TouchSheet';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import styles from './CardArt.module.css';
import type { CardCopy } from './tracker';

/*
 * The tracker draws every card from its own published face, cropped: the round kind glyph from the top right corner,
 * or the name banner across the top. Both are what a player already reads on the card, at a fraction of its size.
 */

/* How wide each crop draws the whole face, for a glyph `size` wide: the crops in the stylesheet scale the face by these. */
const CORNER_SCALE = 6.43;
const PICTO_SCALE = 1.714;

/*
 * Every crop and card the tracker draws comes from one of two copies of the face, a small one and a large one,
 * so the setup can fetch exactly those before a game starts and nothing drawn later waits on the network.
 */
/** The widest small drawing, in CSS pixels: the touch chooser's 48 px glyph crops a face drawn 48 × `PICTO_SCALE` wide. */
const SMALL_FACE_PX = 84;
/** The widest whole card: the held peek. Anything wider than the small copy draws from this one. */
const LARGE_FACE_PX = 240;

/** A card's face as the copy a drawing `width` CSS pixels wide uses, so a 36 px glyph never downloads the full capture. */
export function faceAt(face: string, width: number): string {
  const ratio = typeof window === 'undefined' ? 2 : window.devicePixelRatio || 1;
  return publishedThumbnailSrc(face, (width <= SMALL_FACE_PX ? SMALL_FACE_PX : LARGE_FACE_PX) * ratio);
}

/** Every copy of a face the tracker draws, which is what fetching its pictures ahead means. */
export function faceCopies(face: string): string[] {
  return [...new Set([faceAt(face, SMALL_FACE_PX), faceAt(face, LARGE_FACE_PX)])];
}

/**
 * A card at glyph size: its own illustration cut round from the middle of its face, ringed in its kind's colour.
 * Every card's silhouette is distinct (the Crysknife, the Maula Pistol, the Jubba Cloak), where the kind glyph in its corner is shared by a whole kind.
 * `corner` shows that kind glyph instead, for a heading that stands for a whole kind.
 */
export function CardGlyph({
  card,
  size = 24,
  corner = false,
}: Readonly<{ card: CardCopy; size?: number; corner?: boolean }>) {
  return (
    <span
      className={corner ? styles.glyph : styles.picto}
      style={{ width: size, height: size }}
      data-kind={card.def.kind}
    >
      <img src={faceAt(card.def.face, size * (corner ? CORNER_SCALE : PICTO_SCALE))} alt="" draggable={false} />
    </span>
  );
}

/** An unknown card: the deck's back, or a question mark where a glyph would be. */
export function UnknownGlyph({ size = 24 }: Readonly<{ size?: number }>) {
  return (
    <span className={styles.unknown} style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden>
      ?
    </span>
  );
}

/** Hovering anything that stands for a card shows the whole card, so a cropped glyph never hides what it is. */
export function CardPreview({ card, children }: Readonly<{ card: CardCopy | null; children: ReactNode }>) {
  /* A phone has no hover: there holding the card shows it whole, and a sheet a card opens starts with it. */
  const touch = useTouchSurface();
  if (!card) {
    return children;
  }
  if (touch) {
    return <HeldPreview card={card}>{children}</HeldPreview>;
  }
  return (
    <HoverCard openDelay={250} closeDelay={0} position="right" withinPortal shadow="md" withArrow>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown p={4} className={styles.preview}>
        <img src={faceAt(card.def.face, 180)} alt={card.def.name} width={180} />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

/* How long a thumb rests on a card before it peeks at the whole card. */
const HOLD_MS = 400;

/**
 * Holding a card on a phone shows the whole card over the screen until the thumb lifts, the way hovering does on a desktop.
 * It changes nothing: the click that follows a hold is swallowed, so only a short tap picks the card.
 */
function HeldPreview({ card, children }: Readonly<{ card: CardCopy; children: ReactNode }>) {
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peeked = useRef(false);
  const press = () => {
    peeked.current = false;
    /* A second finger on the same card starts the hold over, so no earlier timer is left to open the card later. */
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      peeked.current = true;
      setHeld(true);
    }, HOLD_MS);
  };
  const lift = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHeld(false);
  };
  return (
    <>
      <span
        className={styles.held}
        onPointerDown={press}
        onPointerUp={lift}
        onPointerCancel={lift}
        onPointerLeave={lift}
        onContextMenu={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (peeked.current) {
            peeked.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </span>
      {held ? (
        <Portal>
          <div className={styles.peek}>
            <img src={faceAt(card.def.face, 240)} alt={card.def.name} width={240} />
          </div>
        </Portal>
      ) : null}
    </>
  );
}

/** On a phone, a sheet opened from a card starts with the whole card: the tap that stands in for hovering it. */
export function SheetCard({ card }: Readonly<{ card: CardCopy | null }>) {
  if (!useTouchSurface() || !card) {
    return null;
  }
  return <img className={styles.sheetCard} src={faceAt(card.def.face, 160)} alt={card.def.name} width={160} />;
}
