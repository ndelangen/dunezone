import preview from '@sb/preview';
import type { TablePiece } from '@shared/play/model';
import { piece } from '@shared/play/setupSupply';
import { useRef } from 'react';
import { expect, waitFor } from 'storybook/test';

import { HandPieceCloseUp } from '@app/widgets/tabletop/PieceCloseUp';

import { dreamrulesCard } from '../product.stories.fixture';

const lasgun = (front?: string): TablePiece => {
  const card = dreamrulesCard('treachery', 'Lasgun', 'lasgun-1');
  return {
    ...piece('lasgun', 'Lasgun', 'seat-2', '#ad8a45', 'card', 'lasgun'),
    items: [front && card.artwork ? { ...card, artwork: { ...card.artwork, front } } : card],
  };
};

/* The width of the copy the hand asks for, as `?w=160` on a published card: its 57px tile is under 160 device pixels on any screen. */
const HAND_COPY_PX = 160;

/** The card's face resized to the hand's copy, as the publisher serves `?w=160`. */
async function handCopy(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = HAND_COPY_PX;
  canvas.height = Math.round((HAND_COPY_PX * image.naturalHeight) / image.naturalWidth);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

function CloseUpOverTable({ piece }: Readonly<{ piece: TablePiece }>) {
  const area = useRef<HTMLDivElement>(null);
  return (
    <div ref={area} style={{ position: 'fixed', inset: 0 }}>
      <HandPieceCloseUp area={area} piece={piece} />
    </div>
  );
}

/* Holding Alt with the pointer at the canvas's left, as a reader does over a card in the hand. */
async function holdAlt() {
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      altKey: true,
      clientX: 40,
      clientY: window.innerHeight / 2,
      pointerType: 'mouse',
    })
  );
  await waitFor(() => expect(document.body.querySelector('[data-piece-close-up]')).not.toBeNull());
}

const meta = preview.meta({
  title: 'Play/Alt close-up',
  parameters: { layout: 'fullscreen' },
  render: (_args, { loaded }) => <CloseUpOverTable piece={lasgun(loaded.front as string | undefined)} />,
});

/**
 * Before: the close-up drew the small copy the hand had already loaded, 160 pixels wide, stretched to the close-up's size.
 * Hold Alt and move over the canvas to bring it back;
 * Alt and scroll zooms it.
 */
export const Before = meta.story({
  loaders: [async () => ({ front: await handCopy(lasgun().items[0]!.artwork!.front!) })],
  play: holdAlt,
});

/**
 * After: the close-up always draws the full capture, 900 pixels wide, however small the card was drawn elsewhere.
 * Hold Alt and move over the canvas to bring it back;
 * Alt and scroll zooms it.
 */
export const After = meta.story({ play: holdAlt });
