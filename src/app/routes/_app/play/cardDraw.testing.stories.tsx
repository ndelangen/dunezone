import { testingPreview } from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { chapter } from './journey.stories.fixture';
import { waitForPlayCamera } from './playing.stories.fixture';
import { sandbox, sandboxReady, sandboxTransport } from './sandbox.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Card draw',
  globals: { motion: 'on' },
  beforeEach: install(() => sandboxTransport({ start: chapter('Bidding') - 1, seat: 'seat-1' })),
});

async function readyTable(canvasElement: HTMLElement) {
  const document = canvasElement.ownerDocument;
  await sandboxReady(within(document.body));
  await waitFor(() => expect(document.querySelector('[data-scene-ready="true"] canvas')).not.toBeNull(), {
    timeout: 30_000,
  });
  await waitForPlayCamera(document);
  await waitFor(() =>
    expect(
      document
        .querySelector('.dune-play-shell')!
        .getAnimations()
        .every((animation) => animation.playState === 'finished')
    ).toBe(true)
  );
  return sandbox.table!;
}

/**
 * Records every draw receipt that reaches the DOM.
 * A receipt lives for the draw's wall-clock duration (about 1.6 s), and a runner that stalls for seconds can add and remove it between two polls of a wait, so the story checks that it was shown rather than catching it on screen.
 */
function watchDrawReceipts(document: Document) {
  const shown = new Set<string>();
  const record = () => {
    for (const receipt of document.querySelectorAll('[data-card-draw]')) {
      shown.add(receipt.getAttribute('data-card-draw') ?? '');
    }
  };
  const observer = new MutationObserver(record);
  observer.observe(document.body, { childList: true, subtree: true });
  record();
  return { shown, stop: () => observer.disconnect() };
}

/** The actual Draw a card action runs through the room, subscription and scene. More cards can be drawn after the story finishes. */
export const DrawOne = meta.story({
  play: async ({ canvasElement, globals }) => {
    const table = await readyTable(canvasElement);
    const deck = table.frame().snapshot.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck')!;
    const before = table.frame().snapshot.hand?.length ?? 0;
    const receipts = watchDrawReceipts(canvasElement.ownerDocument);
    table.receive({
      type: 'command',
      commandId: 'draw-one',
      expectedRevision: table.room.snapshot.revision,
      action: { kind: 'deck-draw', pieceId: deck.id },
    });
    await waitFor(() => expect(table.frame().snapshot.hand).toHaveLength(before + 1));
    await expect(table.refusal).toBeUndefined();
    try {
      if (globals.motion === 'reduce') {
        await expect(canvasElement.ownerDocument.querySelector('[data-card-draw]')).toBeNull();
        await expect(receipts.shown.size).toBe(0);
      } else {
        await waitFor(() => expect(receipts.shown.size).toBe(1));
        await waitFor(() => expect(canvasElement.ownerDocument.querySelector('[data-card-draw]')).toBeNull());
      }
    } finally {
      receipts.stop();
    }
  },
});

/** A spectator sees another seat deal four cards, including the final card in the deck, without receiving their faces. */
export const SpectatorDealFour = meta.story({
  beforeEach: install(() =>
    sandboxTransport({
      start: chapter('Bidding') - 1,
      seat: 'neutral',
      prepare: (stored) => ({
        ...stored,
        table: {
          ...stored.table,
          pieces: stored.table.pieces.map((piece) =>
            piece.stackKey === 'deck:treachery-deck' ? { ...piece, items: piece.items.slice(-4) } : piece
          ),
        },
      }),
    })
  ),
  play: async ({ canvasElement }) => {
    const table = await readyTable(canvasElement);
    const deck = table.frame().snapshot.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck')!;
    const recipient = table.room.snapshot.roster!.seats.find((seat) => seat.id === 'seat-2')!.faction!.id;
    table.receive(
      {
        type: 'command',
        commandId: 'deal-four',
        expectedRevision: table.room.snapshot.revision,
        action: { kind: 'deck-draw', pieceId: deck.id, recipient, count: 4 },
      },
      'seat-1'
    );
    await expect(table.refusal).toBeUndefined();
    await waitFor(() =>
      expect(table.frame().snapshot.table.pieces.find((piece) => piece.id === deck.id)).toBeUndefined()
    );
    await expect(table.frame().snapshot.hand).toBeUndefined();
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('[data-card-draw]')).toHaveTextContent('+4'));
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('[data-card-draw]')).toBeNull(), {
      timeout: 5000,
    });
  },
});

export const MotionOff = DrawOne.extend({ globals: { motion: 'reduce' } });

/** Two accepted draws can be in flight to different factions at once. */
export const RapidDraws = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const table = await readyTable(canvasElement);
    const recipients = table.room.snapshot
      .roster!.seats.filter((seat) => ['seat-2', 'seat-3'].includes(seat.id))
      .map((seat) => seat.faction!.id);
    for (const recipient of recipients) {
      const deck = table.frame().snapshot.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck')!;
      table.receive({
        type: 'command',
        commandId: `draw-${recipient}`,
        expectedRevision: table.room.snapshot.revision,
        action: { kind: 'deck-draw', pieceId: deck.id, recipient },
      });
      await expect(table.refusal).toBeUndefined();
    }
    await waitFor(() => expect(document.querySelectorAll('[data-card-draw]')).toHaveLength(2));
    await waitFor(() => expect(document.querySelectorAll('[data-card-draw]')).toHaveLength(0), { timeout: 5000 });
  },
});
