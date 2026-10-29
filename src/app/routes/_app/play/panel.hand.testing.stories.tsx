import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { install, lastCommand, session } from './game.stories.fixture';
import { mapViewPoint, waitForPlayCamera } from './mapView.stories.fixture';
import { handAndSpiceMeta } from './panel.hand.stories.fixture';
import { openTab, settled } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';
import { dragTo } from './sortable.stories.fixture';

const meta = testingPreview.meta({ ...handAndSpiceMeta, title: 'Play/Spice' });

/** A withdrawal goes to the table as a command, the room's new balance shows, and an observer's table has no reserve. */
export const SpiceReserveRoundTrip = meta.story({
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
    await expect(page.queryByRole('button', { name: 'Take into spice reserve' })).toBeNull();
    const amount = page.getByRole('textbox', { name: 'Spice to withdraw' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '37');
    const token = page.getByRole('button', { name: 'Drag 37 spice to the table' });
    await userEvent.click(token);
    await expect(lastCommand()?.action.kind).not.toBe('bank-withdraw');
    await waitForPlayCamera(canvasElement.ownerDocument);
    const [x, y] = mapViewPoint(canvasElement.ownerDocument, [0, 0.18, -1]);
    await dragTo(token, { x, y });
    const command = lastCommand();
    await expect(command?.action).toMatchObject({ kind: 'bank-withdraw', amount: 37, position: expect.any(Array) });
    if (command?.action.kind === 'bank-withdraw') {
      await expect(command.action.position?.[0]).toBeCloseTo(0, 1);
      await expect(command.action.position?.[2]).toBeCloseTo(-1, 1);
    }
    session.transport.deliver(
      session.transport.view(
        { ...initialSnapshot(), revision: 1, bank: { factionId: 'house-harkonnen', balance: 0 } },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent('0'));
    const observerSnapshot = initialSnapshot('neutral');
    delete observerSnapshot.hand;
    delete observerSnapshot.bank;
    const observer = session.transport.view({ ...observerSnapshot, revision: 2 });
    session.transport.deliver({ ...observer, viewer: { ...observer.viewer, viewerSeat: 'neutral' } });
    await waitFor(() => expect(page.queryByRole('region', { name: 'Spice reserve' })).toBeNull());
  },
});

/** Keyboard placement shows and moves the spice before confirming; Escape leaves the reserve alone. */
export const SpiceKeyboardPlacement = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 37 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    await waitForPlayCamera(canvasElement.ownerDocument);
    const token = page.getByRole('button', { name: 'Drag 1 spice to the table' });
    token.focus();
    await userEvent.keyboard('{Enter}');
    const placement = await page.findByRole('button', { name: 'Place 1 spice here' }, { timeout: 30_000 });
    await expect(placement).toHaveFocus();
    await waitFor(() => expect(placement.getBoundingClientRect().top).toBeGreaterThan(0));
    const start = placement.getBoundingClientRect();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    await waitFor(async () => {
      const moved = placement.getBoundingClientRect();
      await expect(moved.left).toBeGreaterThan(start.left + 30);
      await expect(moved.top).toBeGreaterThan(start.top + 10);
    });
    await expect(lastCommand()?.action.kind).not.toBe('bank-withdraw');
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByRole('button', { name: 'Place 1 spice here' })).toBeNull();
    await expect(token).toHaveFocus();
    await expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent('37');
    await userEvent.keyboard(' ');
    const second = await page.findByRole('button', { name: 'Place 1 spice here' }, { timeout: 30_000 });
    await waitFor(() => expect(second.getBoundingClientRect().top).toBeGreaterThan(0));
    const secondStart = second.getBoundingClientRect();
    await userEvent.keyboard('{ArrowRight}{ArrowUp}');
    await waitFor(async () => {
      await expect(second.getBoundingClientRect().left).toBeGreaterThan(secondStart.left + 10);
      await expect(second.getBoundingClientRect().top).toBeLessThan(secondStart.top - 10);
    });
    const bounds = second.getBoundingClientRect();
    await userEvent.keyboard('{Enter}');
    const action = lastCommand()?.action;
    await expect(action).toMatchObject({ kind: 'bank-withdraw', amount: 1, position: expect.any(Array) });
    if (action?.kind === 'bank-withdraw' && action.position) {
      const [x, y] = mapViewPoint(canvasElement.ownerDocument, action.position);
      await expect(x).toBeCloseTo(bounds.left + bounds.width / 2, 0);
      await expect(y).toBeCloseTo(bounds.top + bounds.height / 2, 0);
    }
    await expect(page.queryByRole('button', { name: 'Place 1 spice here' })).toBeNull();
    await expect(token).toHaveFocus();
  },
});

/** Leaving a keyboard placement by clicking or tabbing cancels it without taking focus back. */
export const SpicePlacementLeavesFocusAlone = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 37 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    await waitForPlayCamera(canvasElement.ownerDocument);
    const token = page.getByRole('button', { name: 'Drag 1 spice to the table' });
    const amount = page.getByRole('textbox', { name: 'Spice to withdraw' });
    token.focus();
    await userEvent.keyboard('{Enter}');
    const first = await page.findByRole('button', { name: 'Place 1 spice here' }, { timeout: 30_000 });
    await expect(first).toHaveFocus();
    await userEvent.click(amount);
    await expect(page.queryByRole('button', { name: 'Place 1 spice here' })).toBeNull();
    await expect(amount).toHaveFocus();
    token.focus();
    await userEvent.keyboard('{Enter}');
    const second = await page.findByRole('button', { name: 'Place 1 spice here' }, { timeout: 30_000 });
    await expect(second).toHaveFocus();
    const scene = canvasElement.ownerDocument.querySelector('canvas')!;
    const [clientX, clientY] = mapViewPoint(canvasElement.ownerDocument, [1.5, 0.18, -1]);
    await userEvent.pointer({ target: scene, coords: { clientX, clientY } });
    await userEvent.tab();
    await expect(page.queryByRole('button', { name: 'Place 1 spice here' })).toBeNull();
    await expect(token).not.toHaveFocus();
    await expect(canvasElement.ownerDocument.activeElement).not.toBe(canvasElement.ownerDocument.body);
    await expect(lastCommand()?.action.kind).not.toBe('bank-withdraw');
  },
});
