import preview from '@sb/preview';
import { LEADERS } from '@shared/assetIds';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Media', ...pageStoryMeta });

export const Catalogue = meta.story({
  args: { path: '/media' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('link', { name: 'Leaders' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Decals' })).toHaveAttribute('href', '/media/game/decals');
    await expect(page.queryByRole('textbox', { name: 'Search media' })).toBeNull();
    await expect(page.queryByRole('link', { name: 'Textures' })).toBeNull();
    await expect(page.queryByRole('article')).toBeNull();
  },
});
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
    await expect(page.getAllByRole('article')).toHaveLength(292);
  },
});
export const LeaderLink = meta.story({
  args: { path: '/media/game/leaders?item=%2Fimage%2Fleader%2Fofficial%2Faramsham.png' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Aramsham' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Open image file' })).toHaveAttribute(
      'href',
      '/image/leader/official/aramsham-large.webp'
    );
    await userEvent.click(page.getByRole('button', { name: 'Close preview' }));
    await expect(page.queryByRole('link', { name: 'Open image file' })).toBeNull();
  },
});
export const LegacyLink = meta.story({
  args: { path: '/__icons' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('heading', { name: 'Media catalogue' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});
export const VisualSearch = meta.story({
  args: { path: '/media/game/decals?q=crossed+knives' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('article', { name: 'Knifes' })).resolves.toBeVisible();
    await expect(page.queryByRole('article', { name: 'Fremen' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Organize collections' })).toBeNull();
    await expect(page.queryByRole('link', { name: 'Link to this view' })).toBeNull();
  },
});
export const LegacyMediaLink = meta.story({
  args: { path: '/__media?kind=leader&q=Aramsham' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('article', { name: 'Aramsham' })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Faction portraits / Emperor' })).toBeVisible();
    const all = page.getByRole('link', { name: 'Show everything from this group' });
    await expect(all).toHaveAttribute('href', '/media/game/leaders?group=Faction+portraits+%2F+Emperor');
  },
});
export const DecalGroup = meta.story({
  args: { path: '/media/game/decals?q=extortion' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Decals / Blades and melee weapons' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Show everything from this group' })).toHaveAttribute(
      'href',
      '/media/game/decals?group=Decals+%2F+Blades+and+melee+weapons'
    );
  },
});

export const CompleteLeaderGroup = meta.story({
  args: { path: '/media/game/leaders?group=Faction+portraits+%2F+Emperor' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('article', { name: 'Shadam' })).resolves.toBeVisible();
    await expect(page.getByRole('article', { name: 'Aramsham' })).toBeVisible();
    await expect(page.queryByRole('link', { name: 'Show everything from this group' })).toBeNull();
  },
});
export const FuzzyDecals = meta.story({
  args: { path: '/media/game/decals?q=knfie' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('article', { name: 'Poison Blade' })).resolves.toBeVisible();
    await expect(page.queryByRole('article', { name: 'Wire' })).toBeNull();
    await expect(page.getByText('No exact matches. Showing close spellings.')).toBeVisible();
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
