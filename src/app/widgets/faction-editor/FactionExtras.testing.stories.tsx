import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { Faction } from '@db/factions';
import { asset, db } from '@db/storybook';

import {
  addExtra,
  saved,
  factionWith,
  FactionExtrasFixture,
  openExtras,
  listedNames,
} from './FactionExtras.stories.fixture';

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

/** Adding from the picker appends the reference, a single card included, and offers each asset once; the save carries only type and slug. */
export const AddFromCatalogue = meta.story({
  args: { faction: factionWith([{ type: 'deck', slug: 'house-treachery' }]) },
  parameters: {
    database: db((baseline) => {
      baseline.assets.push(asset({ type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN }));
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await waitFor(() => expect(listedNames(canvasElement)).toEqual(['House Treachery']), { timeout: 30_000 });
    await userEvent.click(canvas.getByRole('button', { name: 'Add Extra' }));
    const body = within(canvasElement.ownerDocument.body);
    /* The picker opens on custom cards; it mounts transparent and fades in, so the check finishes the fade. */
    await waitForFrame(
      () => expect(finishTransitions(body.getByRole('option', { name: /Battle reference/ }))).toBeVisible(),
      { timeout: 30_000 }
    );
    await userEvent.click(body.getByRole('option', { name: /Battle reference/ }));
    await waitFor(() => expect(listedNames(canvasElement)).toEqual(['House Treachery', 'Battle reference']));
    /* A listed deck is not offered again. */
    await userEvent.click(canvas.getByRole('button', { name: 'Add Extra' }));
    await userEvent.selectOptions(await body.findByRole('combobox', { name: 'Type' }), 'Decks');
    await body.findByRole('option', { name: /Standard Storm Deck/ }, { timeout: 30_000 });
    await expect(body.queryByRole('option', { name: /House Treachery/ })).toBeNull();
    await userEvent.click(body.getByRole('button', { name: 'Done' }));
    await addExtra(canvasElement, 'Bundles', /Atreides Tokens/);
    await addExtra(canvasElement, 'Leader tokens', /Duke Prad Vidal/);
    await waitFor(() =>
      expect(listedNames(canvasElement)).toEqual([
        'House Treachery',
        'Battle reference',
        'Atreides Tokens',
        'Duke Prad Vidal',
      ])
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save faction' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    await expect((saved.mock.calls[0]![0] as Faction).extras).toEqual([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'card-custom', slug: 'battle-reference' },
      { type: 'bundle', slug: 'atreides-tokens' },
      { type: 'token-leader', slug: 'duke-prad-vidal' },
    ]);
  },
});

/** A populated list draws each asset by name, says when one has left the catalogue, and removing a row drops it from the list and the proof. */
export const Remove = meta.story({
  args: {
    faction: factionWith([
      { type: 'deck', slug: 'house-treachery' },
      { type: 'bundle', slug: 'atreides-tokens' },
      { type: 'card-custom', slug: 'gone-card' },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openExtras(canvasElement);
    await waitFor(
      () => expect(listedNames(canvasElement)).toEqual(['House Treachery', 'Atreides Tokens', 'gone-card']),
      {
        timeout: 30_000,
      }
    );
    await expect(canvas.getByText(/No longer in the catalogue/)).toBeVisible();
    /* The proof groups each reference under its kind. */
    const proof = within(canvas.getByRole('region', { name: 'Starting Extras' }));
    await expect(proof.getByText('Decks')).toBeVisible();
    await expect(proof.getByText('Bundles')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove House Treachery' }));
    await expect(listedNames(canvasElement)).toEqual(['Atreides Tokens', 'gone-card']);
    await expect(proof.queryByText('house-treachery')).toBeNull();
  },
});
