import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';

import { pageStoryMeta } from '../../../../storybookConfig';

/*
 * Every Asset create page loads an existing Asset of its own type through the same control as the card pages (see `Assets/Load card`).
 * These cover the types beyond cards: tokens, and the containers whose members are copied by the save.
 */
const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Assets/Load existing',
  args: { path: '/assets/token-disc/create' },
});

async function loadExisting(canvasElement: HTMLElement, noun: string, option: RegExp) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: `Load existing ${noun}` }));
  await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: option })));
  const load = await page.findByRole('button', { name: new RegExp(`^Load ${noun}$`) });
  /* The choice is read from its own page before it can be loaded. */
  await waitFor(() => expect(load).toBeEnabled());
  await userEvent.click(load);
  return page;
}

/** The disc token page offers disc tokens only, and the copy saves as a separate token with the same data. */
export const DiscTokenCopy = meta.story({
  play: async ({ canvasElement }) => {
    const page = await loadExisting(canvasElement, 'token', /Karama/);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Karama');
    await userEvent.click(page.getByRole('button', { name: 'Save token' }));
    await expect(page.findByRole('button', { name: 'Delete token' })).resolves.toBeVisible();
    await expect((await loadAssetPage('token-disc', 'karama-1'))?.asset.data).toEqual(
      (await loadAssetPage('token-disc', 'karama'))?.asset.data
    );
  },
});

export const EnhanceTokenCopy = meta.story({
  args: { path: '/assets/token-enhance/create' },
  play: async ({ canvasElement }) => {
    const page = await loadExisting(canvasElement, 'token', /Kwisatz Haderach/);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Kwisatz Haderach');
    await userEvent.click(page.getByRole('button', { name: 'Save token' }));
    await expect(page.findByRole('button', { name: 'Delete token' })).resolves.toBeVisible();
    await expect((await loadAssetPage('token-enhance', 'kwisatz-haderach-1'))?.asset.data).toEqual(
      (await loadAssetPage('token-enhance', 'kwisatz-haderach'))?.asset.data
    );
  },
});

/** A deck brings its cards: they show on the create page, and the save copies them onto the new deck. */
export const DeckCopyWithCards = meta.story({
  args: { path: '/assets/deck/create' },
  play: async ({ canvasElement }) => {
    const page = await loadExisting(canvasElement, 'deck', /Standard Storm Deck/);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Standard Storm Deck');
    await userEvent.click(page.getByRole('tab', { name: /Cards/ }));
    await expect(page.getByText(/These cards are copied from Standard Storm Deck when you save/)).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Save deck' }));
    await expect(page.findByRole('button', { name: 'Delete deck' })).resolves.toBeVisible();
    const source = await loadAssetPage('deck', 'standard-storm-deck');
    const copy = await loadAssetPage('deck', 'standard-storm-deck-1');
    await expect(copy?.asset.data).toEqual(source?.asset.data);
    await expect(copy?.members.map((entry) => [entry.member.id, entry.count])).toEqual(
      source?.members.map((entry) => [entry.member.id, entry.count])
    );
    await expect(copy?.members).toHaveLength(6);
  },
});

/** Reset after a load drops the loaded deck's cards along with its data, so the save copies nothing. */
export const DeckResetDropsCards = meta.story({
  args: { path: '/assets/deck/create' },
  play: async ({ canvasElement }) => {
    const page = await loadExisting(canvasElement, 'deck', /Standard Storm Deck/);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    await userEvent.click(page.getByRole('tab', { name: /Cards/ }));
    await expect(page.getByText('Cards can be added once the deck has been saved.')).toBeVisible();
  },
});

export const BundleCopyWithTokens = meta.story({
  args: { path: '/assets/bundle/create' },
  play: async ({ canvasElement }) => {
    const page = await loadExisting(canvasElement, 'bundle', /Atreides Tokens/);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Atreides Tokens');
    await userEvent.click(page.getByRole('button', { name: 'Save bundle' }));
    await expect(page.findByRole('button', { name: 'Delete bundle' })).resolves.toBeVisible();
    await waitFor(async () =>
      expect((await loadAssetPage('bundle', 'atreides-tokens-1'))?.members.map((entry) => entry.member.name)).toEqual(
        expect.arrayContaining(['Karama', 'Kwisatz Haderach'])
      )
    );
  },
});
