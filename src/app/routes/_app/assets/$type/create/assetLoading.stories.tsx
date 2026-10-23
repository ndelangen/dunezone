import preview from '@sb/preview';
import { publishingRectangleTokenFace } from '@shared/assets/fixtures/publishingRectangleTokenFace';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';
import { db } from '@db/storybook';

import { pageStoryMeta } from '../../../../storybookConfig';
import { loadExisting } from './assetLoading.stories.fixture';

/*
 * Every Asset create and edit page loads an existing Asset of its own type through the same control as the card pages (see `Assets/Load card`).
 * These cover the types beyond cards (tokens, and the containers whose members are copied by the save) and the edit pages.
 */
const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Assets/Load existing',
  args: { path: '/assets/token-disc/create' },
});

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

function rawLinkedToken(type: 'token-disc' | 'token-enhance', slug: string) {
  return {
    args: { path: `/assets/${type}/${slug}/edit` },
    parameters: {
      database: db((baseline) => {
        const target = baseline.assets.find((asset) => asset.type === type)!;
        const face = type === 'token-enhance' ? publishingRectangleTokenFace : publishingTokenFace;
        baseline.assets.push({
          ...target,
          $key: 'raw-authored-back',
          slug: 'raw-authored-back',
          data: { name: 'Authored token back', about: '', front: face, back: { mode: 'custom', face } },
        });
        baseline.assets.push({
          ...target,
          $key: 'raw-original-back',
          slug: 'raw-original-back',
          data: { name: 'Original token back', about: '', front: face, back: { mode: 'custom', face } },
        });
      }),
    },
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const page = within(canvasElement.ownerDocument.body);
      await page.findByRole('button', { name: 'storybook-viewer' });
      await page.findByRole('textbox', { name: 'Name' });
      await userEvent.click(page.getByRole('radio', { name: /Another token's back/ }));
      await userEvent.click(page.getByRole('button', { name: 'Choose' }));
      await userEvent.click(await page.findByRole('option', { name: /Original token back/ }));
      await userEvent.click(page.getByRole('button', { name: 'Save token' }));
      await waitFor(() =>
        expect(page.getByRole('button', { name: 'Save token' })).toHaveAccessibleDescription(/^Saved/)
      );
      const before = (await loadAssetPage(type, slug))!;
      const source = (await loadAssetPage(type, 'raw-authored-back'))!;
      const value = { ...(before.asset.data as object), back: { mode: 'reference', asset_id: source.asset.id } };
      await userEvent.click(page.getByRole('button', { name: 'Load existing token' }));
      await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
      const input = page.getByRole('textbox', { name: 'Writable JSON' });
      const invalid = JSON.stringify({ ...value, back: { mode: 'reference', asset_id: before.asset.id } });
      await userEvent.click(input);
      await userEvent.paste(invalid);
      await waitFor(() =>
        expect(page.getByRole('alert')).toHaveTextContent(
          'A token cannot reference itself; use the same-front-and-back mode'
        )
      );
      await expect(page.getByRole('alert')).not.toHaveTextContent('[CONVEX');
      await expect(input).toHaveValue(invalid);
      await expect(page.getByRole('button', { name: 'Load token' })).toBeDisabled();
      await expect(page.getAllByText('Back, from Original token back')[0]).toBeVisible();
      await expect((await loadAssetPage(type, slug))!.asset.data).toEqual(before.asset.data);
      await userEvent.clear(input);
      await userEvent.paste(JSON.stringify(value));
      await waitFor(() => expect(page.getByRole('button', { name: 'Load token' })).toBeEnabled());
      await userEvent.click(page.getByRole('button', { name: 'Load token' }));
      const proof = page.getAllByText('Back, from Authored token back')[0];
      await expect(proof).toBeVisible();
      await expect(proof.parentElement!.querySelector('svg')).not.toBeNull();
      await expect(page.getByText('Authored token back', { exact: true })).toBeVisible();
      await expect(page.queryByText('No token chosen')).not.toBeInTheDocument();
      await expect((await loadAssetPage(type, slug))!.asset.data).toEqual(before.asset.data);
      await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
      await expect(page.queryByText('Back, from Authored token back')).not.toBeInTheDocument();
      const original = page.getAllByText('Back, from Original token back')[0];
      await expect(original).toBeVisible();
      await expect(original.parentElement!.querySelector('svg')).not.toBeNull();
      await expect(page.getByRole('radio', { name: /Another token's back/ })).toBeChecked();
    },
  };
}

export const RawDiscLinkedBack = meta.story({ ...rawLinkedToken('token-disc', 'karama') });
export const RawRectangleLinkedBack = meta.story({ ...rawLinkedToken('token-enhance', 'kwisatz-haderach') });
