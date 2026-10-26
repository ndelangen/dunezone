import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { VIEWER, faction, alliancesSnapshot } from './alliances.stories.fixture';
import { openPanel, openFactionInfo } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Alliances',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

export const IncomingOffer = meta.story({
  beforeEach: install(() => productTransport(VIEWER, alliancesSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* An offer flows across the table as arcs; it is answered in the Alliances tab. */
    await openPanel(canvasElement, 'Alliances');
    await expect(page.findByText('Offers you an alliance')).resolves.toBeVisible();
    await userEvent.click(await page.findByRole('button', { name: 'Accept' }));
    await expect(lastCommand()).toMatchObject({
      action: { kind: 'alliance-accept', factionId: faction(session.transport.snapshot, 'seat-1'), offer: 0 },
    });
  },
});

export const AlliedPlayerInfo = meta.story({
  beforeEach: install(() => productTransport(VIEWER, alliancesSnapshot())),
  play: async ({ canvasElement }) => {
    const ally = alliancesSnapshot().controls!.players.find((player) => player.seat === 'seat-4')!;
    const page = await openFactionInfo(canvasElement, ally.name);
    await waitFor(() => expect(page.getByText(/^Allied with/)).toBeVisible());
  },
});

/* Once the game is finished, everyone still sees who was allied, but nobody can change it. */
export const FinishedReadOnly = meta.story({
  beforeEach: install(() => {
    const snapshot = alliancesSnapshot();
    snapshot.stage = 'finished';
    snapshot.result = {
      kind: 'alliance',
      factionIds: [faction(snapshot, 'seat-4'), faction(snapshot, 'seat-5')],
      by: { seat: 'seat-1', name: 'Seat 1' },
      declaredAt: 1,
    };
    return productTransport(VIEWER, snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('img', { name: /are allied/ }, { timeout: 30_000 })).toBeVisible();
    await openPanel(canvasElement, 'Alliances');
    await expect(await page.findByText('Offers you an alliance')).toBeVisible();
    await expect(
      page.queryByRole('button', { name: /Offer alliance|Accept|Withdraw offer|Break alliance/ })
    ).toBeNull();
  },
});
