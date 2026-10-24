import { testingPreview } from '@sb/preview';
import { LEADERS } from '@shared/assetIds';
import { resolveAsset } from '@shared/media/resolveAsset';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({ title: 'Media', ...pageStoryMeta });
export const Leaders = meta.story({
  args: { path: '/media/game/leaders' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('heading', { name: 'Alien portraits / Armored creatures' })).resolves.toBeVisible();
    await expect(page.getAllByRole('article')).toHaveLength(LEADERS.options.length);
  },
});
export const Decals = meta.story({
  args: { path: '/media/game/decals' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('heading', { name: 'Decals / Blades and melee weapons' })).resolves.toBeVisible();
    await expect(page.getAllByRole('article')).toHaveLength(311);
  },
});

export const LeaderLink = meta.story({
  args: { path: '/media/game/leaders?item=%2Fimage%2Fleader%2Fofficial%2Faramsham.png' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Aramsham' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Open image file' })).toHaveAttribute(
      'href',
      resolveAsset('/image/leader/official/aramsham.png', 'large')
    );
    await userEvent.click(page.getByRole('button', { name: 'Close preview' }));
    await expect(page.queryByRole('link', { name: 'Open image file' })).toBeNull();
  },
});

export const DecalVersions = meta.story({
  args: { path: '/media/game/decals?q=atomics' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const tile = within(await page.findByRole('article', { name: 'Atomics' }));
    await expect(tile.getByRole('img')).toHaveAttribute('src', '/vector/decal/atomics.svg');
    await userEvent.click(tile.getByRole('button', { name: 'Color' }));
    await expect(tile.getByRole('img')).toHaveAttribute('src', '/vector/decal/atomics-multicolor.svg');
    await expect(tile.getByRole('link')).toHaveAttribute(
      'href',
      '/media/game/decals?item=%2Fvector%2Fdecal%2Fatomics-multicolor.svg&q=atomics'
    );
    await expect(tile.getByRole('button', { name: 'Color' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(tile.getByRole('button', { name: 'Mono' }));
    await expect(tile.getByRole('img')).toHaveAttribute('src', '/vector/decal/atomics.svg');
  },
});
