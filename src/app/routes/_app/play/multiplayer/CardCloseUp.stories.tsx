import preview from '@sb/preview';
import type { TablePiece } from '@shared/play/model';
import { piece } from '@shared/play/setupSupply';
import { useRef } from 'react';
import { expect, waitFor } from 'storybook/test';

import { HandPieceCloseUp } from '@app/widgets/tabletop/PieceCloseUp';

import { dreamrulesCard } from '../product.stories.fixture';

const lasgun: TablePiece = {
  ...piece('lasgun', 'Lasgun', 'seat-2', '#ad8a45', 'card', 'lasgun'),
  items: [dreamrulesCard('treachery', 'Lasgun', 'lasgun-1')],
};

function CloseUpOverTable({ piece }: Readonly<{ piece: TablePiece }>) {
  const area = useRef<HTMLDivElement>(null);
  return (
    <div ref={area} style={{ position: 'fixed', inset: 0 }}>
      <HandPieceCloseUp area={area} piece={piece} />
    </div>
  );
}

/* Holding Alt with the pointer at the canvas's left, as a reader does over a card in the hand; the story wait's shared bound covers a slow runner. */
async function holdAlt() {
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      altKey: true,
      clientX: 40,
      clientY: window.innerHeight / 2,
      pointerType: 'mouse',
    })
  );
  /* Settled only once the full capture is shown, not while its slot waits or it arrives. */
  await waitFor(async () => {
    const face = document.body.querySelector<HTMLImageElement>('[data-piece-close-up] [data-phase="shown"] img');
    await expect(face?.naturalWidth).toBe(900);
  });
}

const meta = preview.meta({
  title: 'Play/Alt close-up',
  parameters: { layout: 'fullscreen' },
  render: () => <CloseUpOverTable piece={lasgun} />,
});

/**
 * A Treachery card from the hand, drawn from its full capture, however small the hand drew it, so it stays sharp when zoomed.
 * Hold Alt and move over the canvas to bring it back;
 * Alt and scroll zooms it.
 */
export const TreacheryCard = meta.story({ play: holdAlt });
