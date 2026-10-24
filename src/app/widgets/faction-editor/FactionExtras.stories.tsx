import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { saved, factionWith, FactionExtrasFixture, openExtras, listedSlugs } from './FactionExtras.stories.fixture';

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

/** A populated list, then removing a row drops it from the list and the proof. */
export const Remove = meta.story({
  args: {
    faction: factionWith([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'bundle', slug: 'atreides-tokens' },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    /* A populated list shows each reference and groups the proof under its kind. */
    await expect(listedSlugs(canvasElement)).toEqual(['house-treachery', 'atreides-tokens']);
    const proof = within(canvas.getByRole('region', { name: 'Starting Extras' }));
    await expect(proof.getByText('Decks')).toBeVisible();
    await expect(proof.getByText('Bundles')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove house-treachery' }));
    await expect(listedSlugs(canvasElement)).toEqual(['atreides-tokens']);
    await expect(proof.queryByText('house-treachery')).toBeNull();
  },
});
