import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { DeckPicker } from './DeckPicker';
import { DREAMRULES_SPICE } from './spiceDeck.stories.fixture';
import type { SpiceDeckChoice } from './spiceDeckSupply';

const DECKS: SpiceDeckChoice[] = [
  { id: 'dreamrules', name: 'Dreamrules Spice Deck', ruleset: 'Dreamrules' },
  { id: 'gf9', name: 'GF9 Spice Deck', ruleset: 'GF9' },
];

const meta = preview.meta({
  title: 'Tools/Spice deck/Deck picker',
  component: DeckPicker,
  args: {
    decks: DECKS,
    loadDeck: async () => DREAMRULES_SPICE,
    onStart: () => {},
  },
  globals: { viewport: { value: 'appMobile' } },
});

/** The decks a table can play with, one per ruleset that slots a spice deck. */
export const Decks = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /Dreamrules/ })).toBeEnabled();
  },
});

/**
 * A deck picked: its card pictures are fetched before the game starts, so no card flies in before its face can show.
 * The bar fills as they come in; this story holds it at 9 of 24.
 */
export const FetchingCards = meta.story({
  args: {
    preload: async (_srcs, onProgress) => {
      onProgress?.(9, 24);
      await new Promise<never>(() => {});
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: /Dreamrules/ }));
    await expect(await page.findByText('Fetching the cards · 9 of 24')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Fetching the Dreamrules Spice Deck' })).toHaveValue(9);
  },
});
