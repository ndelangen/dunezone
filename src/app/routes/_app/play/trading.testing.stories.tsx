import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor } from 'storybook/test';

import { openFactionInfo } from './controls.stories.fixture';
import { gameMeta, install, lastCommand } from './game.stories.fixture';
import { productTransport, swappingSnapshot } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Trading',
});

export const Offers = meta.story({
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
    const page = await openFactionInfo(canvasElement, 'Twaffle');
    await page.findByRole('button', { name: 'Accept trade from House Atreides' }, { timeout: 30_000 });
    await openFactionInfo(canvasElement, 'fectumbra');
    await expect(page.getByRole('button', { name: 'Offer trade to Emperor' })).toBeDisabled();
    await openFactionInfo(canvasElement, 'Ridwan');
    await expect(page.getByRole('button', { name: 'Cancel offer to Fremen' })).toBeEnabled();
    await openFactionInfo(canvasElement, 'Twaffle');
    await userEvent.click(page.getByRole('button', { name: 'Accept trade from House Atreides' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ action: { kind: 'swap-accept', offerId: 'offer-one' } }));
  },
});
