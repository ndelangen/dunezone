import { HoverCard } from '@mantine/core';
import { publishedThumbnailSrc } from '@shared/asset-publishing/publishedThumbnail';
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

/** A card's face as a copy no wider than it is drawn, so a 36 px glyph never downloads the full capture. */
export function faceAt(face: string, width: number): string {
  const ratio = typeof window === 'undefined' ? 2 : window.devicePixelRatio || 1;
  return publishedThumbnailSrc(face, width * ratio);
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
  if (!card) {
    return children;
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
