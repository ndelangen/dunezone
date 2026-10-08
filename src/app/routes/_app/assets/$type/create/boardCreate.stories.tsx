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
    await userEvent.click(page.getByRole('button', { name: /^Undo$/ }));
    await expect(page.getByText('Decal 1 · Arrakis City')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Redo$/ }));
    await expect(page.getByText('Decal 1 · Seitch')).toBeVisible();
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
    await expect(page.getByRole('button', { name: /^Redo$/ })).toBeEnabled();
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
