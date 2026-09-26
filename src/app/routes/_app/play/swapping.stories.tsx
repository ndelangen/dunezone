import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand } from './game.stories.fixture';
import { productTransport, swappingSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Swapping',
});

export const Swapping = meta.story({
  beforeEach: install(() => productTransport('seat-2', swappingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const offer = await page.findByRole('button', { name: 'Offer trade to House Atreides' }, { timeout: 30_000 });
    await userEvent.click(offer);
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        action: { kind: 'swap-offer', seat: 'seat-2', target: 'seat-1', round: 'story-round' },
      })
    );
  },
});

export const TradingOffers = meta.story({
  beforeEach: install(() => {
    const snapshot = swappingSnapshot();
    snapshot.swapping!.offers = [
      { id: 'offer-one', origin: 'seat-1', target: 'seat-2', order: 1 },
      { id: 'offer-two', origin: 'seat-2', target: 'seat-5', order: 2 },
    ];
    snapshot.swapping!.ready = ['seat-3'];
    snapshot.swapping!.nextOrder = 3;
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Accept trade from House Atreides' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'fectumbra' }));
    expect(page.getByRole('button', { name: 'Offer trade to Emperor' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Ridwan' }));
    expect(page.getByRole('button', { name: 'Cancel offer to Fremen' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Twaffle' }));
    await userEvent.click(page.getByRole('button', { name: 'Accept trade from House Atreides' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ action: { kind: 'swap-accept', offerId: 'offer-one' } }));
  },
});

export const TradingEndedWithVacancy = meta.story({
  beforeEach: install(() => {
    const snapshot = swappingSnapshot();
    snapshot.swapping!.closed = true;
    snapshot.swapping!.deadline = 1;
    snapshot.controls!.seats = snapshot.controls!.seats.filter((seat) => seat !== 'seat-6');
    snapshot.controls!.players = snapshot.controls!.players.filter((player) => player.seat !== 'seat-6');
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('Trading ended. Waiting for approved replacements.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: /Offer trade to/ })).toBeNull();
    expect(page.getByRole('button', { name: 'Ready to start' })).toBeDisabled();
  },
});
