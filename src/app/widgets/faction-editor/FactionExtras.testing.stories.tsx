import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { Faction } from '@db/factions';
import { asset, db } from '@db/storybook';

import { saved, factionWith, FactionExtrasFixture, openExtras, listedSlugs } from './FactionExtras.stories.fixture';

const meta = testingPreview.meta({
  title: 'Faction Editor/Extras',
  component: FactionExtrasFixture,
  args: { faction: factionWith(undefined) },
  globals: { viewport: { value: 'appDesktop' } },
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
  beforeEach: () => {
    saved.mockClear();
  },
});

/** Adding from the picker appends the reference and offers each asset once; the save carries only type and slug. */
export const AddFromCatalogue = meta.story({
  args: { faction: factionWith([{ type: 'deck', slug: 'house-treachery' }]) },
  parameters: {
    database: db((baseline) => {
      baseline.assets.push(asset({ type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN }));
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add Extra' }));
    const body = within(canvasElement.ownerDocument.body);
    /* The picker mounts transparent and fades in, so the check finishes the fade rather than waiting for the frames that draw it. */
    await waitForFrame(
      () => expect(finishTransitions(body.getByRole('option', { name: /Atreides Tokens/ }))).toBeVisible(),
      { timeout: 30_000 }
    );
    await expect(body.queryByRole('option', { name: /House Treachery/ })).toBeNull();
    await userEvent.click(body.getByRole('option', { name: /Atreides Tokens/ }));
    await waitFor(() => expect(listedSlugs(canvasElement)).toEqual(['house-treachery', 'atreides-tokens']));
    await userEvent.click(canvas.getByRole('button', { name: 'Add Extra' }));
    await userEvent.click(await body.findByRole('option', { name: /Duke Prad Vidal/ }));
    await waitFor(() =>
      expect(listedSlugs(canvasElement)).toEqual(['house-treachery', 'atreides-tokens', 'duke-prad-vidal'])
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save faction' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    await expect((saved.mock.calls[0]![0] as Faction).extras).toEqual([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'bundle', slug: 'atreides-tokens' },
      { type: 'token-leader', slug: 'duke-prad-vidal' },
    ]);
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
