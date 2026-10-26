import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { db } from '@db/storybook';

import { saved, factionWith, FactionExtrasFixture, openExtras } from './FactionExtras.stories.fixture';

const meta = preview.meta({
  title: 'Faction Editor/Extras',
  component: FactionExtrasFixture,
  args: { faction: factionWith(undefined) },
  globals: { viewport: { value: 'appDesktop' } },
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
  beforeEach: () => {
    saved.mockClear();
  },
});

/** A faction saved before Extras existed: no field, nothing added, Save free. */
export const Empty = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await expect(canvas.getByText('No Extras. The faction brings only its own components.')).toBeVisible();
    await expect(canvas.getByText("Nothing beyond the faction's own components.")).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save faction' })).toBeEnabled();
  },
});

/** A faction bringing a single custom card, a deck, a bundle and a token: each listed as the picker draws it. */
export const Populated = meta.story({
  args: {
    faction: factionWith([
      { type: 'card-custom', slug: 'battle-reference' },
      { type: 'deck', slug: 'house-treachery' },
      { type: 'bundle', slug: 'atreides-tokens' },
      { type: 'token-enhance', slug: 'kwisatz-haderach' },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await expect(await canvas.findByText('Battle reference', {}, { timeout: 30_000 })).toBeVisible();
  },
});
