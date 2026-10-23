import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';
import { db } from '@db/storybook';

import { findSave } from '../../../../authoringToolbarPlay';
import { pageStoryMeta } from '../../../../storybookConfig';
import { loadExisting } from './assetLoading.stories.fixture';

/*
 * Every Asset create and edit page loads an existing Asset of its own type through the same control as the card pages (see `Assets/Load card`).
 * These cover the types beyond cards (tokens, and the containers whose members are copied by the save) and the edit pages.
 */
const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Assets/Load existing',
  args: { path: '/assets/token-disc/create' },
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

/** Raw data replacement never replaces a container's relation rows or quantities. */
export const RawDeckKeepsMembers = meta.story({
  args: { path: '/assets/deck/standard-storm-deck/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Name' });
    const before = (await loadAssetPage('deck', 'standard-storm-deck'))!;
    await userEvent.click(page.getByRole('button', { name: 'Load existing deck' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    await userEvent.click(page.getByRole('textbox', { name: 'Writable JSON' }));
    await userEvent.paste(
      JSON.stringify({ ...(before.asset.data as Record<string, unknown>), about: 'Reviewed deck description.' })
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Load deck' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Load deck' }));
    await userEvent.click(page.getByRole('button', { name: 'Save deck' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save deck' })).toHaveAccessibleDescription(/^Saved/));
    const after = (await loadAssetPage('deck', 'standard-storm-deck'))!;
    await expect(after.asset.id).toBe(before.asset.id);
    await expect(after.members.map((entry) => [entry.member.id, entry.count])).toEqual(
      before.members.map((entry) => [entry.member.id, entry.count])
    );
  },
});

export const RawDeckLinkedBack = meta.story({
  args: { path: '/assets/deck/standard-storm-deck/edit' },
  parameters: {
    database: db((baseline) => {
      const source = baseline.assets.find((asset) => asset.type === 'deck' && asset.slug === 'house-treachery')!;
      baseline.assets.push({
        ...source,
        $key: 'raw-authored-deck-back',
        slug: 'raw-authored-deck-back',
        data: { ...(source.data as object), name: 'Authored deck back' },
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'storybook-viewer' });
    await page.findByRole('textbox', { name: 'Name' });
    await userEvent.click(page.getByRole('tab', { name: 'Back' }));
    await userEvent.click(page.getByRole('radio', { name: /Another deck's back/ }));
    await userEvent.click(page.getByRole('button', { name: 'Choose' }));
    await userEvent.click(await page.findByRole('option', { name: /House Treachery/ }));
    await userEvent.click(page.getByRole('button', { name: 'Save deck' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save deck' })).toHaveAccessibleDescription(/^Saved/));
    const before = (await loadAssetPage('deck', 'standard-storm-deck'))!;
    const source = (await loadAssetPage('deck', 'raw-authored-deck-back'))!;
    const value = { ...(before.asset.data as object), cardback: { mode: 'reference', asset_id: source.asset.id } };
    await userEvent.click(page.getByRole('button', { name: 'Load existing deck' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    await userEvent.click(page.getByRole('textbox', { name: 'Writable JSON' }));
    await userEvent.paste(JSON.stringify(value));
    await waitFor(() => expect(page.getByRole('button', { name: 'Load deck' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Load deck' }));
    await userEvent.click(page.getByRole('tab', { name: 'Back' }));
    await expect(page.getAllByText('Cardback, from Authored deck back')[0]).toBeVisible();
    await expect(page.getAllByRole('img', { name: 'Authored deck back: preview unavailable' })[0]).toBeVisible();
    await expect(page.getAllByText('Authored deck back', { exact: true })[0]).toBeVisible();
    await expect(page.queryByText('No deck chosen')).not.toBeInTheDocument();
    await expect((await loadAssetPage('deck', 'standard-storm-deck'))!.asset.data).toEqual(before.asset.data);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(page.queryByText('Cardback, from Authored deck back')).not.toBeInTheDocument();
    await expect(page.getAllByText('Cardback, from House Treachery')[0]).toBeVisible();
    await expect(page.getByRole('radio', { name: /Another deck's back/ })).toBeChecked();
    await expect((await loadAssetPage('deck', 'standard-storm-deck'))!.members).toEqual(before.members);
  },
});

export const RawStyledTokenSave = meta.story({
  args: { path: '/assets/token-disc/karama/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'storybook-viewer' });
    await page.findByRole('textbox', { name: 'Name' });
    const before = (await loadAssetPage('token-disc', 'karama'))!;
    const data = before.asset.data as { name: string; front: object };
    const replacement = {
      ...data,
      front: {
        ...data.front,
        symbolFill: '#07120f',
        symbolStroke: '#f3edbf',
        symbolStrokeWidth: 5.5,
        symbolShadow: false,
      },
    };
    await userEvent.click(page.getByRole('button', { name: 'Load existing token' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    await userEvent.click(page.getByRole('textbox', { name: 'Writable JSON' }));
    await userEvent.paste(JSON.stringify(replacement));
    await waitFor(() => expect(page.getByRole('button', { name: 'Load token' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Load token' }));
    await expect((await loadAssetPage('token-disc', 'karama'))!.asset.data).toEqual(before.asset.data);
    await userEvent.click(page.getByRole('button', { name: 'Save token' }));
    await waitFor(async () => expect((await loadAssetPage('token-disc', 'karama'))?.asset.data).toEqual(replacement));
    const saved = (await loadAssetPage('token-disc', 'karama'))!;
    await expect(saved.asset.id).toBe(before.asset.id);
    await expect(saved.assignedGroup).toEqual(before.assignedGroup);
    await expect(saved.inDecks).toEqual(before.inDecks);
  },
});
