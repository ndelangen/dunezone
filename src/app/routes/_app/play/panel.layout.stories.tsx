import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { WAIT } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { openPieceMenu, openTab, paintedColor, settled } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Layout',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/**
 * The grouped controls keep Yours first and remember each group's last destination.
 * Private reserves and public history occupy separate panes;
 * the primary rail stays in place.
 */
export const Tabs = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      bank: { factionId: 'house-harkonnen', balance: 4 },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Shared inventory');
    const rail = () => page.getByRole('tablist', { name: 'Controls' });
    await settled(async () => {
      await expect(
        within(rail())
          .getAllByRole('tab')
          .map((item) => item.getAttribute('aria-label'))
      ).toEqual(['Yours', 'Game', 'Table', 'History']);
      await expect(page.getByRole('tab', { name: 'Shared inventory' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('region', { name: 'Shared inventory' })).toBeVisible();
      await expect(page.queryByRole('heading', { name: 'Spice reserve' })).toBeNull();
    });
    /* Compared as plain numbers: two DOMRects have no own enumerable properties, so toEqual on the rects themselves is always true. */
    const railBox = rail().getBoundingClientRect().toJSON();

    await openTab(page, 'Spice');
    await settled(async () => {
      await expect(page.getByRole('region', { name: 'Spice reserve' })).toBeVisible();
      await expect(page.queryByRole('region', { name: 'Public spice transfers' })).toBeNull();
      await expect(page.queryByRole('heading', { name: 'Shared inventory' })).toBeNull();
    });

    await openTab(page, 'Phase');
    await settled(async () => {
      await expect(page.queryByRole('button', { name: 'Replay from start' })).toBeNull();
      await expect(page.queryByRole('region', { name: 'Hosted connection' })).toBeNull();
      await expect(page.queryByRole('heading', { name: 'Spice reserve' })).toBeNull();
      await expect(rail().getBoundingClientRect().toJSON()).toEqual(railBox);
    });
    await userEvent.click(within(rail()).getByRole('tab', { name: 'Yours' }));
    await expect(page.getByRole('tab', { name: 'Spice' })).toHaveAttribute('aria-selected', 'true');
    await openTab(page, 'Spice transfers');
    await expect(page.getByRole('region', { name: 'Public spice transfers' })).toBeVisible();
    await expect(page.queryByRole('region', { name: 'Spice reserve' })).toBeNull();
    await openTab(page, 'Settings');
    await expect(page.getByRole('textbox', { name: 'Last turn' })).toBeVisible();
    await openTab(page, 'Replay');
    await expect(page.getByRole('button', { name: 'Replay from start' })).toBeVisible();
    await openTab(page, 'Hand');
    /* The phase controls stay in the header, outside the tabs. */
    await expect(page.getByRole('group', { name: 'Phase navigation' }).closest('header')).not.toBeNull();
  },
});

/** The Play panel and its portaled controls keep their table palette inside the warm dark app. */
export const SchemeIsland = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
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
    await expect(tablePaint[0]).toBe(
      paintedColor(island, view.getComputedStyle(island).getPropertyValue('--color-text').trim())
    );
    const deck = initialSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const glass = paintedColor(island, view.getComputedStyle(island).getPropertyValue('--glass-overlay').trim());
    const menu = await openPieceMenu(canvasElement.ownerDocument, deck, 'Deck actions');
    /* The ring carries the table's leather palette. */
    await expect(
      view.getComputedStyle(within(menu).getByRole('menuitem', { name: 'Draw a card' })).backgroundColor
    ).toBe('rgba(24, 16, 10, 0.95)');
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(page.queryByRole('menu')).toBeNull());
    const raised = paintedColor(island, view.getComputedStyle(island).getPropertyValue('--tip-surface').trim());
    const help = page.getByRole('tab', { name: 'Spice' });
    /* By its words, as the tab's tooltip. */
    const spiceReserveTip = () =>
      page.queryAllByRole('tooltip').find((tip) => tip.textContent?.includes('Your private spice reserve')) ?? null;
    await userEvent.hover(help);
    const tooltip = await waitForFrame(async () => {
      const tip = spiceReserveTip();
      await expect(tip).not.toBeNull();
      return tip!;
    });
    await expect(view.getComputedStyle(tooltip).backgroundColor).toBe(raised);
    await expect(raised).not.toBe(glass);
    await userEvent.unhover(help);
    await waitForFrame(() => expect(spiceReserveTip()).toBeNull());
    await expect(paint()).toEqual(tablePaint);
  },
});

/** A spectator's dock opens on History and its game log. */
export const SpectatorOpensOnLog = meta.story({
  beforeEach: install(() => productTransport('neutral')),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('tab', { name: 'Game log' }, WAIT)).resolves.toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tablist', { name: 'Controls' }).querySelector('[aria-label="Table"]')).toHaveAttribute(
      'aria-selected',
      'false'
    );
  },
});

/** Rejections stay visible in the destinations that sent the setting or history request. */
export const SettingsAndReplayRefusals = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
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
