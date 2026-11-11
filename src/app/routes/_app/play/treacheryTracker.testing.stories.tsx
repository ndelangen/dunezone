import { testingPreview } from '@sb/preview';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { item, piece } from '@shared/play/setupSupply';
import { expect, within } from 'storybook/test';

import { DREAMRULES_DECK } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { cardBack } from './product.stories.fixture';
import { piece as tablePiece, sandbox, sandboxReady, shown } from './sandbox.stories.fixture';
import { atreidesSandbox, trackerMeta, trackerTransport } from './treacheryTracker.stories.fixture';

const meta = testingPreview.meta({ ...trackerMeta, title: 'Play/Treachery tracker' });

const BIDDING_PHASE = STANDARD_PHASES.findIndex((entry) => entry.id === 'bidding');

/* The Bidding phase, with Atreides holding open the face-down card of this name that is up for bid. */
function peekingAt(name: string) {
  return (snapshot: GameSnapshot) => {
    const card = DREAMRULES_DECK.find((entry) => entry.name === name)!;
    const bid = piece('bid-card', name, 'shared', '#000000', 'card', 'card');
    bid.items = [item('bid-card-item', name, card.face, cardBack(), 'card-treachery', false, 'Treachery')];
    snapshot.phase = BIDDING_PHASE;
    snapshot.table.pieces = [...snapshot.table.pieces, bid];
    /* The peek shows the card's face; on the table it stays face down. */
    snapshot.peek = { piece: { ...bid, items: bid.items.map((entry) => ({ ...entry, faceUp: true })) } };
  };
}

/** A faction whose rules allow it opens the Treachery tracker under Yours: a fresh copy of the game's deck, and the seated factions in seat order. */
export const AtTheTable = meta.story({
  beforeEach: install(trackerTransport),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Treachery tracker');
    await expect(page.findByText(/^Deck \d+/, undefined, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/*
 * In the Bidding phase Atreides peeks at the card up for bid, and the tracker puts that card up for bid by itself.
 * Everything else stays the player's own work; "Not up for bid" dismisses a card peeked at for another reason.
 */
export const APeekPutsTheCardUpForBid = meta.story({
  beforeEach: install(() => trackerTransport(peekingAt('Lasgun'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Treachery tracker');
    const onBid = await page.findByRole('region', { name: 'On bid' }, { timeout: 30_000 });
    await expect(within(onBid).findByRole('button', { name: 'House Atreides won Lasgun' })).resolves.toBeVisible();
  },
});

/** On the live table, Atreides pulls the top card out of the Treachery deck and peeks at it: the tracker puts that card up for bid. */
export const APeekAtTheLiveTable = meta.story({
  beforeEach: install(atreidesSandbox),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await sandboxReady(page);
    await openTab(page, 'Treachery tracker');
    const table = sandbox.table!;
    const deck = tablePiece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    const command = (
      commandId: string,
      action: Extract<Parameters<typeof table.receive>[0], { type: 'command' }>['action']
    ) => table.receive({ type: 'command', commandId, expectedRevision: table.room.snapshot.revision, action });
    command('tracker-peek-deck', { kind: 'peek', pieceId: deck.id });
    command('tracker-pull', { kind: 'peek-pull', pieceId: deck.id, index: deck.items.length - 1 });
    command('tracker-close', { kind: 'peek-close' });
    const pulled = shown().table.pieces.find((candidate) => candidate.id.startsWith('pulled-'))!;
    command('tracker-peek-card', { kind: 'peek', pieceId: pulled.id });
    await expect(table.refusal).toBeUndefined();
    const name = shown().peek!.piece.items[0]!.artwork!.name!;
    const onBid = await page.findByRole('region', { name: 'On bid' }, { timeout: 30_000 });
    await expect(within(onBid).findByRole('button', { name: `House Atreides won ${name}` })).resolves.toBeVisible();
  },
});
