import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';

import { findSave } from '../../../../authoringToolbarPlay';
import { pageStoryMeta } from '../../../../storybookConfig';

/*
 * Every Asset create and edit page loads an existing Asset of its own type through the same control as the card pages (see `Assets/Load card`).
 * These cover the types beyond cards (tokens, and the containers whose members are copied by the save) and the edit pages.
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

/** A token copy saves as a separate token with the same data, whichever token type the page edits. */
function tokenCopy(type: string, name: string, slug: string) {
  return meta.story({
    args: { path: `/assets/${type}/create` },
    play: async ({ canvasElement }) => {
      const page = await loadExisting(canvasElement, 'token', new RegExp(name));
      await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(name);
      await userEvent.click(page.getByRole('button', { name: 'Save token' }));
      await expect(page.findByRole('button', { name: 'Delete token' })).resolves.toBeVisible();
      await expect((await loadAssetPage(type, `${slug}-1`))?.asset.data).toEqual(
        (await loadAssetPage(type, slug))?.asset.data
      );
    },
  });
}

export const DiscTokenCopy = tokenCopy('token-disc', 'Karama', 'karama');

export const EnhanceTokenCopy = tokenCopy('token-enhance', 'Kwisatz Haderach', 'kwisatz-haderach');

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
    /* The edit page the save lands on lists the copied members and holds nothing unsaved. */
    await userEvent.click(page.getByRole('tab', { name: 'Tokens' }));
    for (const name of ['Karama', 'Kwisatz Haderach']) {
      await expect(page.findByRole('textbox', { name: `How many ${name}` })).resolves.toHaveValue('1');
    }
    await expect(findSave(canvasElement)).resolves.toHaveAccessibleDescription(/^No unsaved changes/);
    await waitFor(async () =>
      expect((await loadAssetPage('bundle', 'atreides-tokens-1'))?.members.map((entry) => entry.member.name)).toEqual(
        expect.arrayContaining(['Karama', 'Kwisatz Haderach'])
      )
    );
  },
});

/** An edit page loads another asset's content but keeps its own name, and leaves itself out of the choices. */
export const CardEditLoad = meta.story({
  args: { path: '/assets/card-storm/3-sectors/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load existing card' }));
    await waitForFrame(() => page.getByRole('option', { name: /5 Sectors/ }));
    await expect(page.queryByRole('option', { name: /3 Sectors/ })).toBeNull();
    await userEvent.click(page.getByRole('option', { name: /5 Sectors/ }));
    const load = page.getByRole('button', { name: /^Load card$/ });
    await waitFor(() => expect(load).toBeEnabled());
    await userEvent.click(load);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('3 Sectors');
    await expect(page.getByText('Move the storm 5 sectors counter-clockwise.')).toBeVisible();
  },
});

/** A deck edit page loads another deck's cardback and texts; its own cards stay as they are. */
export const DeckEditLoad = meta.story({
  args: { path: '/assets/deck/house-treachery/edit' },
  play: async ({ canvasElement }) => {
    const page = await loadExisting(canvasElement, 'deck', /Standard Storm Deck/);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('House Treachery');
    await userEvent.click(page.getByRole('button', { name: 'Save deck' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save deck' })).toHaveAccessibleDescription(/Saved/));
    const saved = await loadAssetPage('deck', 'house-treachery');
    await expect(saved?.asset.data).toMatchObject({ cardback: { mode: 'preset', key: 'storm' } });
    await expect(saved?.members.map((entry) => entry.count)).toEqual([3]);
  },
});
