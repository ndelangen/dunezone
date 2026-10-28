import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { openCompass } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { openPieceMenu, openTab, paintedColor, settled } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Layout',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/**
 * The windows the compass opens: one at a time in the centre, Hand and Spice as one, and the header's phase controls outside them all.
 */
export const Windows = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 4 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared table inventory');
    await settled(async () => {
      await expect(page.getByRole('region', { name: 'Shared table inventory' })).toBeVisible();
      await expect(page.queryByRole('heading', { name: 'Spice reserve' })).toBeNull();
    });
    const compass = await openCompass(page);
    await userEvent.type(compass.getByRole('textbox', { name: 'Search controls' }), 'hand');
    await settled(async () => {
      await expect(compass.getAllByRole('option').map((item) => item.textContent)).toContainEqual(
        expect.stringMatching(/^Hand & spice/)
      );
    });
    await userEvent.keyboard('{Escape}');

    await openTab(page, 'Spice');
    await settled(async () => {
      await expect(page.getByRole('region', { name: 'Spice reserve' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your hand and leaders' })).toBeVisible();
      await expect(page.queryByRole('region', { name: 'Public spice transfers' })).toBeNull();
      await expect(page.queryByRole('heading', { name: 'Shared table inventory' })).toBeNull();
    });

    await openTab(page, 'Phase');
    await settled(async () => {
      await expect(page.queryByRole('button', { name: 'Replay from start' })).toBeNull();
      await expect(page.queryByRole('region', { name: 'Hosted connection' })).toBeNull();
      await expect(page.queryByRole('heading', { name: 'Spice reserve' })).toBeNull();
    });
    await openTab(page, 'Spice transfers');
    await expect(page.getByRole('region', { name: 'Public spice transfers' })).toBeVisible();
    await expect(page.queryByRole('region', { name: 'Spice reserve' })).toBeNull();
    await openTab(page, 'Settings');
    await expect(page.getByRole('textbox', { name: 'Last turn' })).toBeVisible();
    await openTab(page, 'Replay');
    await expect(page.getByRole('button', { name: 'Replay from start' })).toBeVisible();
    await openTab(page, 'Hand');
    /* The phase controls stay in the header, outside the windows. */
    await expect(page.getByRole('group', { name: 'Phase navigation' }).closest('header')).not.toBeNull();
  },
});

/** The Play panel and its portaled menu share the core app palette; the tooltip's own surface is the kit's to show. */
export const SchemeIsland = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    const balance = await page.findByLabelText('Spice reserve balance');
    const button = page.getByRole('button', { name: 'Withdraw spice' });
    const island = balance.closest<HTMLElement>('[data-scheme-dark]')!;
    const root = canvasElement.ownerDocument.documentElement;
    const view = canvasElement.ownerDocument.defaultView!;
    const paint = () => [view.getComputedStyle(balance).color, view.getComputedStyle(button).backgroundColor];
    await expect(root).toHaveAttribute('data-mantine-color-scheme', 'dark');
    const tablePaint = paint();
    await expect(view.getComputedStyle(island).getPropertyValue('--color-brand').trim()).toBe(
      view.getComputedStyle(root).getPropertyValue('--color-brand').trim()
    );
    await expect(view.getComputedStyle(island).getPropertyValue('--mantine-color-dark-7').trim()).toBe(
      view.getComputedStyle(root).getPropertyValue('--mantine-color-dark-7').trim()
    );
    /* The window's ink, which its frame sets for everything inside it. */
    await expect(tablePaint[0]).toBe(view.getComputedStyle(balance.closest('[data-window]')!).color);
    const deck = initialSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const glass = paintedColor(island, 'rgb(from var(--glass-overlay) r g b / var(--glass-overlay-alpha))');
    const menu = await openPieceMenu(canvasElement.ownerDocument, deck, 'Deck actions');
    /* The menu keeps the app surface even when portaled out of the table. */
    await expect(
      view.getComputedStyle(within(menu).getByRole('menuitem', { name: 'Draw a card' })).backgroundColor
    ).toBe(glass);
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(page.queryByRole('menu')).toBeNull());
    await expect(paint()).toEqual(tablePaint);
  },
});

/** Rejections stay visible in the destinations that sent the setting or history request. */
export const SettingsAndReplayRefusals = meta.story({
  beforeEach: install(() => productTransport('seat-2')),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Settings');
    const turn = page.getByRole('textbox', { name: 'Last turn' });
    await userEvent.clear(turn);
    await userEvent.type(turn, '6');
    await userEvent.tab();
    await expect(lastCommand()?.action).toEqual({ kind: 'last-turn', turn: 6 });
    session.transport.deliver({
      type: 'rejected',
      requestId: lastCommand()!.commandId,
      message: 'The game length could not be changed.',
    });
    await expect(page.findByText('The game length could not be changed.')).resolves.toBeVisible();
    await openTab(page, 'Replay');
    await userEvent.click(page.getByRole('button', { name: 'Replay from start' }));
    session.transport.deliver({
      type: 'rejected',
      requestId: 'message',
      message: 'That checkpoint could not be loaded.',
    });
    await expect(page.findByText('That checkpoint could not be loaded.')).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay from start' })).toBeEnabled();
  },
});
