import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';

import { pageStoryMeta } from '../../../../storybookConfig';

const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Board editor', args: { path: '/assets/board/create' } });
export const Blank = meta.story({});
export const Arrakis = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load board' }));
    await userEvent.click(await page.findByRole('button', { name: /^Arrakis$/ }));
    await userEvent.click(await page.findByRole('button', { name: 'Load Arrakis' }));
    await waitFor(() => expect(page.getAllByRole('tab')).toHaveLength(42));
  },
});
export const SaveAndReopen = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load board' }));
    await userEvent.click(await page.findByRole('button', { name: /^Arrakis$/ }));
    await userEvent.click(await page.findByRole('button', { name: 'Load Arrakis' }));
    await userEvent.clear(page.getByRole('textbox', { name: 'Board name' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Board name' }), 'Authored Arrakis');
    await userEvent.click(page.getByRole('button', { name: 'Add sietch icon' }));
    const handle = page.getByRole('button', { name: 'Reorder decal 2' });
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowUp]');
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(page.getByText('Decal 1 · Seitch')).toBeVisible());
    await userEvent.click(page.getByRole('button', { name: 'Show decal before cropping' }));
    await userEvent.click(page.getByRole('button', { name: 'Save board' }));
    await expect(page.findByRole('button', { name: 'Delete board' })).resolves.toBeVisible();
    const saved = await loadAssetPage('board', 'authored-arrakis');
    expect(saved?.assetPublishing?.captureStatus).toBe('scheduled');
    expect(Object.keys((saved!.asset.data as { board: { properties: object } }).board.properties)).toHaveLength(42);
    expect(JSON.stringify(saved?.asset.data)).not.toContain('ghosts');
    const properties = (
      saved!.asset.data as { board: { properties: Record<string, { name: string; decals: { artwork: string }[] }> } }
    ).board.properties;
    expect(
      Object.values(properties)
        .find((territory) => territory.name === 'arrakeen')
        ?.decals.map((decal) => decal.artwork)
    ).toEqual(['/vector/icon/seitch.svg', '/vector/icon/arrakis-city.svg']);
  },
});
