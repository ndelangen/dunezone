import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { openTab, settled } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Hand and spice',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A Treachery card drawn into the viewer's hand sits beside the faction's leaders, each draggable back onto the table. */
export const Hand = meta.story({
  beforeEach: install(() => {
    const snapshot = initialSnapshot();
    const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
    snapshot.hand!.push({ ...card, owner: 'house-harkonnen' });
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: /^Hand$/ }));
    await expect(page.findByRole('button', { name: 'Drag Snooper from hand' })).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Drag Feyd Rautha from hand' })).toBeVisible();
  },
});

export const SpiceReserve = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 37 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('tab', { name: 'Spice' })).toBeVisible(), {
      timeout: 30_000,
    });
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByRole('region', { name: 'Spice reserve' })).toBeVisible());
    await expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent('37');
    await expect(page.queryByRole('button', { name: 'Take into spice reserve' })).toBeNull();
    const amount = page.getByRole('textbox', { name: 'Spice to withdraw' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '38');
    await expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '37');
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    const command = lastCommand();
    await expect(command?.action).toEqual({ kind: 'bank-withdraw', amount: 37 });
    session.transport.deliver(
      session.transport.view(
        { ...initialSnapshot(), revision: 1, bank: { factionId: 'house-harkonnen', balance: 0 } },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent('0'));
    await expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    const observerSnapshot = initialSnapshot('neutral');
    delete observerSnapshot.hand;
    delete observerSnapshot.bank;
    const observer = session.transport.view({ ...observerSnapshot, revision: 2 });
    session.transport.deliver({ ...observer, viewer: { ...observer.viewer, viewerSeat: 'neutral' } });
    await waitFor(() => expect(page.queryByRole('region', { name: 'Spice reserve' })).toBeNull());
  },
});

export const SpiceReserveNarrow = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: install(() =>
    productTransport('seat-1', {
      ...initialSnapshot('seat-1'),
      bank: { factionId: 'house-atreides', balance: 0 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('tab', { name: 'Spice' })).toBeVisible());
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByLabelText('Spice reserve balance')).toBeVisible());
    await userEvent.hover(page.getByRole('tab', { name: 'Spice' }));
    /* The tooltip's label mounts only from inside an animation-frame callback, so each poll runs the waiting frames itself (https://github.com/ndelangen/dunezone/issues/1422). Resting on the tab brings the reserve's help. */
    await waitForFrame(() =>
      expect(
        finishTransitions(within(page.getByRole('tooltip')).getByText(/^Only you see this balance\./))
      ).toBeVisible()
    );
    await userEvent.unhover(page.getByRole('tab', { name: 'Spice' }));
    await expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    await expect(page.queryByRole('button', { name: 'Take into spice reserve' })).toBeNull();
  },
});

/* Public spice transfers name each end in words (#1664): a faction's spice reserve by its name, the table and the Spice Bank, and a faction gone from the roster as such. */
export const SpiceTransfers = meta.story({
  beforeEach: install(() => {
    const snapshot = initialSnapshot();
    const faction = snapshot.roster!.seats[1]!.faction!;
    return productTransport('seat-2', {
      ...snapshot,
      bank: { factionId: faction.id, balance: 4 },
      spiceTransfers: [
        { revision: 4, actor: 'Thialfi', kind: 'disposal', amount: 1, source: 'table' },
        { revision: 3, actor: 'Thialfi', kind: 'collection', amount: 3, source: 'table', destination: 'gone-faction' },
        { revision: 2, actor: 'Twaffle', kind: 'supply', amount: 6, source: 'supply', destination: 'table' },
        { revision: 1, actor: 'Thialfi', kind: 'withdrawal', amount: 2, source: faction.id, destination: 'table' },
      ],
    });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice transfers');
    const faction = initialSnapshot().roster!.seats[1]!.faction!;
    await settled(async () => {
      await expect(
        within(page.getByRole('region', { name: 'Public spice transfers' }))
          .getAllByRole('listitem')
          .map((item) => item.textContent)
      ).toEqual([
        'Thialfi returned 1 spice to the Spice Bank.',
        'Thialfi collected 3 spice from the table to a faction no longer in the game.',
        'Twaffle took 6 spice from the Spice Bank to the table.',
        `Thialfi withdrew 2 spice from the ${faction.name} spice reserve to the table.`,
      ]);
    });
  },
});
