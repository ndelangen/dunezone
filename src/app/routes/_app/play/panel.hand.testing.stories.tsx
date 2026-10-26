import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { windowNamed } from './controls.stories.fixture';
import { install, lastCommand, session } from './game.stories.fixture';
import { emptySpiceReserve, handAndSpiceMeta } from './panel.hand.stories.fixture';
import { openTab, settled } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

const meta = testingPreview.meta({ ...handAndSpiceMeta, title: 'Play/Panels/Hand and spice' });

export const SpiceReserve = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 37 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByRole('region', { name: 'Spice reserve' })).toBeVisible());
    await expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent('37');
    await expect(page.queryByRole('button', { name: 'Take into spice reserve' })).toBeNull();
    const amount = page.getByRole('textbox', { name: 'Spice to withdraw' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '38');
    await expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    /* Clicking Withdraw moves focus off the amount, and the amount past the balance stays as typed, so nothing is withdrawn. */
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    await expect(amount).toHaveValue('38');
    await expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    await expect(lastCommand()).toBeUndefined();
    /* A fractional amount stays as typed the same way, rather than rounding to a count the click would withdraw. */
    await userEvent.clear(amount);
    await userEvent.type(amount, '1.6');
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    await expect(amount).toHaveValue('1.6');
    await expect(lastCommand()).toBeUndefined();
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

/** The narrow reserve keeps its rested guidance reachable before withdrawing is possible. */
export const SpiceReserveNarrowGuidance = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: emptySpiceReserve,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByLabelText('Spice reserve balance')).toBeVisible());
    const help = within(windowNamed(page, 'Spice')!).getByRole('img', { name: 'Help' });
    await userEvent.hover(help);
    /* The tooltip's label mounts only from inside an animation-frame callback, so each poll runs the waiting frames itself (https://github.com/ndelangen/dunezone/issues/1422). Resting on the (?) brings the reserve's help. */
    await waitForFrame(() =>
      expect(
        finishTransitions(within(page.getByRole('tooltip')).getByText(/Drop a stack on the Spice Bank disc\./))
      ).toBeVisible()
    );
    await userEvent.unhover(help);
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
