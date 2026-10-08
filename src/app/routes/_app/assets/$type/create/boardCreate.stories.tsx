import preview from '@sb/preview';
import { BoardAsset } from '@shared/boards/schema';
import type { BoardAssetData } from '@shared/boards/schema';
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
    handle.scrollIntoView({ block: 'center' });
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowUp]');
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(page.getByText('Decal 1 · Seitch')).toBeVisible());
    await userEvent.click(page.getByRole('button', { name: /^Undo$/ }));
    await expect(page.getByText('Decal 1 · Arrakis City')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Redo$/ }));
    await expect(page.getByText('Decal 1 · Seitch')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Show decal before cropping' }));
    await userEvent.click(page.getByRole('button', { name: 'Save board' }));
    await expect(page.findByRole('button', { name: 'Delete board' })).resolves.toBeVisible();
    const saved = await loadAssetPage('board', 'authored-arrakis');
    expect(saved?.assetPublishing?.captureStatus).toBe('scheduled');
    expect(
      Object.values((saved!.asset.data as BoardAssetData).board.properties).find((p) => p.name === 'Arrakeen')?.id
    ).toBe('arrakeen');
    const properties = BoardAsset.parse(saved!.asset.data).board.properties;
    expect(Object.keys(properties)).toHaveLength(42);
    expect(JSON.stringify(saved?.asset.data)).not.toContain('ghosts');
    expect(
      Object.values(properties)
        .find((territory) => territory.id === 'arrakeen')
        ?.decals.map((decal) => decal.artwork)
    ).toEqual(['/vector/icon/seitch.svg', '/vector/icon/arrakis-city.svg']);
  },
});

export const TerritoryNames = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load board' }));
    await userEvent.click(await page.findByRole('button', { name: /^Arrakis$/ }));
    await userEvent.click(await page.findByRole('button', { name: 'Load Arrakis' }));
    await userEvent.click(page.getByRole('tab', { name: 'Rock outcroppings' }));
    await expect(page.getByRole('textbox', { name: 'Territory name' })).toHaveValue('Rock outcroppings');
    await expect(page.getByRole('textbox', { name: 'Territory ID' })).toHaveValue('rock_outcroppings');
    await userEvent.click(page.getByRole('tab', { name: 'Arrakeen' }));
    const name = page.getByRole('textbox', { name: 'Territory name' });
    await userEvent.clear(name);
    await expect(page.getByText('Enter a territory name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save board' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(name, 'ROCK-OUTCROPPINGS');
    await expect(page.getByText('Territory ID "rock_outcroppings" is already in use')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save board' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(page.getByRole('tab', { name: 'Rock outcroppings' }));
    await expect(page.getByText('Territory ID "rock_outcroppings" is already in use')).toBeVisible();
    await userEvent.click(page.getByRole('tab', { name: 'ROCK-OUTCROPPINGS' }));
    await userEvent.clear(page.getByRole('textbox', { name: 'Territory name' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Territory name' }), 'Arrakeen city');
    await expect(page.getByRole('textbox', { name: 'Territory ID' })).toHaveValue('arrakeen_city');
    await expect(page.getByRole('button', { name: 'Save board' })).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(page.getByRole('button', { name: /^Undo$/ }));
    await expect(page.getByRole('button', { name: 'Save board' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(page.getByRole('button', { name: /^Redo$/ }));
    await expect(page.getByRole('button', { name: 'Save board' })).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(page.getByRole('button', { name: 'Save board' }));
    await expect(page.findByRole('button', { name: 'Delete board' })).resolves.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Territory name' })).toHaveValue('Arrakeen city');
    await expect(page.getByRole('textbox', { name: 'Territory ID' })).toHaveValue('arrakeen_city');
    const saved = await loadAssetPage('board', 'arrakis');
    expect(
      Object.values((saved!.asset.data as BoardAssetData).board.properties).find((p) => p.name === 'Arrakeen city')?.id
    ).toBe('arrakeen_city');
  },
});

export const DrawCurves = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Snap points' }));
    await userEvent.click(page.getByRole('button', { name: 'Add decal' }));
    await expect(await page.findByRole('textbox', { name: 'Search artwork' })).toHaveFocus();
    const territoryName = page.getByRole('textbox', { name: 'Territory name' });
    await userEvent.click(territoryName);
    await waitFor(() => expect(territoryName).toHaveFocus());
    const svg = page.getByRole('group', { name: 'Editable board' });
    const place = async (x: number, y: number) => {
      const rect = svg.getBoundingClientRect();
      await userEvent.pointer({
        keys: '[MouseLeft]',
        target: svg,
        coords: { clientX: rect.left + (x / 487.06) * rect.width, clientY: rect.top + (y / 487.06) * rect.height },
      });
    };
    await userEvent.click(page.getByRole('button', { name: 'Draw a cubic curve' }));
    await place(160, 180);
    await place(180, 100);
    await place(300, 100);
    await place(320, 180);
    await userEvent.click(page.getByRole('button', { name: 'Draw a circular arc' }));
    await place(200, 270);
    await place(240, 290);
    await place(280, 270);
    await userEvent.click(page.getByRole('button', { name: 'Select territories' }));
    await expect(page.getAllByRole('button', { name: /^Move boundary point/ })).toHaveLength(8);
    await userEvent.click(page.getByRole('button', { name: /^Undo$/ }));
    await userEvent.click(page.getByRole('button', { name: 'Move boundary point e' }));
    await expect(page.getByRole('button', { name: /^Redo$/ })).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(page.getByRole('button', { name: /^Redo$/ }));
    await userEvent.clear(page.getByRole('textbox', { name: 'Board name' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Board name' }), 'Curved board');
    await userEvent.click(page.getByRole('button', { name: 'Save board' }));
    await expect(page.findByRole('button', { name: 'Delete board' })).resolves.toBeVisible();
    const saved = await loadAssetPage('board', 'curved-board');
    const board = (saved!.asset.data as { board: { nodes: object; edges: { kind: string }[] } }).board;
    expect(Object.keys(board.nodes)).toHaveLength(8);
    expect(board.edges.map((edge) => edge.kind)).toEqual(['arc', 'arc', 'arc', 'arc', 'cubic', 'arc']);
  },
});
