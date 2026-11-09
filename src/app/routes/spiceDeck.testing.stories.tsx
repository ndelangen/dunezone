import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { seedStoredGame, storyGame } from './_tool/tools/spice-deck/spiceDeck.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/* The spice deck's behaviour that returns to a screen the visual stories already show. */
const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tools/Spice deck',
  args: { path: '/tools/spice-deck' },
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' }, motion: 'on' },
});

const pageOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/**
 * Settings > Pick another deck opens the deck picker with the game kept: the ruleset whose deck the table plays with, how many spice piles, and how many cards a peek shows.
 * Backing out returns to the game.
 */
export const PickAnotherDeck = meta.story({
  beforeEach: () => seedStoredGame(storyGame(3)),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Game settings' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Pick another deck' }));
    await expect(await page.findByText('Pick the deck your table plays with')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Back to the game' }));
    await expect(await page.findByText('Spice pile A · 4')).toBeVisible();
  },
});
