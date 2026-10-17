import preview from '@sb/preview';
import { BoardAsset } from '@shared/boards/schema';
import type { BoardAssetData } from '@shared/boards/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';

import arrakisMapSvg from '../../../../../widgets/tabletop/assets/arrakis-map.svg?raw';
import { pageStoryMeta } from '../../../../storybookConfig';

const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Board editor', args: { path: '/assets/board/create' } });
/** The blank editor at rest: an unnamed board whose disc is still one undivided territory. */
export const Blank = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Board name' }, { timeout: 30_000 })).resolves.toHaveValue('');
    const territories = within(page.getByRole('tablist', { name: 'Territories' }));
    await expect(territories.getAllByRole('tab')).toHaveLength(1);
  },
});
export const Arrakis = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load existing board' }));
    await userEvent.click(await page.findByRole('button', { name: /^Arrakis$/ }));
    await userEvent.click(await page.findByRole('button', { name: 'Load board' }));
    await waitFor(() => expect(page.getAllByRole('tab')).toHaveLength(42));
  },
});
export const SaveAndReopen = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const load = await page.findByRole('button', { name: 'Load existing board' });
    await userEvent.click(load);
    await userEvent.click(await page.findByRole('button', { name: /^Arrakis$/ }));
    await userEvent.click(await page.findByRole('button', { name: 'Load board' }));
    /*
     * Closing the popover hands focus back to its trigger on the next animation frame.
     * Typing before that frame lands loses the rest of the name to the trigger, and the board then saves under another slug.
     */
    await waitFor(() => expect(load).toHaveFocus());
    const name = page.getByRole('textbox', { name: 'Board name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Authored Arrakis');
    await expect(name).toHaveValue('Authored Arrakis');
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
    await expect(saved?.assetPublishing?.captureStatus).toBe('scheduled');
    await expect(
      Object.values((saved!.asset.data as BoardAssetData).board.properties).find((p) => p.name === 'Arrakeen')?.id
    ).toBe('arrakeen');
    const properties = BoardAsset.parse(saved!.asset.data).board.properties;
    await expect(Object.keys(properties)).toHaveLength(42);
    await expect(JSON.stringify(saved?.asset.data)).not.toContain('ghosts');
    await expect(
      Object.values(properties)
        .find((territory) => territory.id === 'arrakeen')
        ?.decals.map((decal) => decal.artwork)
    ).toEqual(['/vector/icon/seitch.svg', '/vector/icon/arrakis-city.svg']);
  },
});

/**
 * A picked picture sits under the drawing as a tracing guide.
 * It is held as a local object URL, so it is never uploaded or saved, and the canvas says it is not part of the board.
 */
export const TracingImage = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Tracing image' }, { timeout: 30_000 }));
    const dialog = within(await page.findByRole('dialog', { name: 'Tracing image' }));
    const input = canvasElement.ownerDocument.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
    await userEvent.upload(input, new File([arrakisMapSvg], 'arrakis-map.svg', { type: 'image/svg+xml' }));
    await waitFor(() => expect(dialog.getByText('arrakis-map.svg')).toBeVisible());
    await expect(page.findByText(/guide only, not part of your board/)).resolves.toBeVisible();
    await expect(canvasElement.ownerDocument.querySelector('[data-tracing-image]')?.getAttribute('href')).toMatch(
      /^blob:/
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Move image' }));
    await expect(page.getByRole('button', { name: 'Move tracing image' })).toHaveAttribute('aria-pressed', 'true');
  },
});

export const TerritoryNames = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load existing board' }));
    await userEvent.click(await page.findByRole('button', { name: /^Arrakis$/ }));
    await userEvent.click(await page.findByRole('button', { name: 'Load board' }));
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
    await expect(
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
    await expect(Object.keys(board.nodes)).toHaveLength(8);
    await expect(board.edges.map((edge) => edge.kind)).toEqual(['arc', 'arc', 'arc', 'arc', 'cubic', 'arc']);
  },
});
