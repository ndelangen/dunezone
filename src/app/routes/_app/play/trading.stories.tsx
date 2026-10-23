import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand } from './game.stories.fixture';
import { productTransport, swappingSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Trading',
});

export const Swapping = meta.story({
  beforeEach: install(() => productTransport('seat-2', swappingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const offer = await page.findByRole('button', { name: 'Offer trade to House Atreides' }, { timeout: 30_000 });
    /* The deadline is four minutes past the view's serverNow, and the countdown runs on the page's monotonic clock from there. */
    await expect(page.getByLabelText('Trading time remaining')).toHaveTextContent(/^(4:00|3:[0-5]\d) left$/);
    await expect(page.getByRole('button', { name: 'Ready' })).toBeEnabled();
    await userEvent.click(offer);
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        action: { kind: 'swap-offer', seat: 'seat-2', target: 'seat-1', round: 'story-round' },
      })
    );
  },
});

export const EndedWithVacancy = meta.story({
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
    await waitFor(
      () =>
        expect(page.getByLabelText('Trading time remaining')).toHaveTextContent(
          'Trading ended. Waiting for approved replacements.'
        ),
      { timeout: 30_000 }
    );
    await expect(page.getByLabelText('Trading time remaining')).toBeVisible();
    await expect(page.queryByRole('button', { name: /Offer trade to/ })).toBeNull();
    await expect(page.getByRole('button', { name: 'Ready' })).toBeDisabled();
  },
});
