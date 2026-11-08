import { testingPreview } from '@sb/preview';
import { LEADERS } from '@shared/assetIds';
import { resolveAsset } from '@shared/media/resolveAsset';
import { isRetiredStockAsset } from '@shared/retiredStockAssets';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

/* Retired portraits stay valid ids but are never offered. */
const offeredLeaderCount = LEADERS.options.filter((image) => !isRetiredStockAsset(image)).length;

const meta = testingPreview.meta({ title: 'Media', ...pageStoryMeta });
export const Leaders = meta.story({
  args: { path: '/media/game/leaders' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('heading', { name: 'Alien portraits / Armored creatures' })).resolves.toBeVisible();
    await expect(page.getAllByRole('article')).toHaveLength(offeredLeaderCount);
    await expect(page.getByRole('link', { name: 'Back to the media catalogue' })).toHaveAttribute('href', '/media');
  },
});
export const Decals = meta.story({
  args: { path: '/media/game/decals' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('heading', { name: 'Decals / Blades and melee weapons' })).resolves.toBeVisible();
    await expect(page.getAllByRole('article')).toHaveLength(345);
  },
});

export const LeaderLink = meta.story({
  args: { path: '/media/game/leaders?item=%2Fimage%2Fleader%2Fofficial%2Faramsham.png' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const detail = await page.findByRole('heading', { name: 'Aramsham' }, { timeout: 30_000 });
    await expect(detail).toBeVisible();
    /* The detail opens in the gallery, after the artwork it shows, not above the results. */
    const articles = page.getAllByRole('article');
    const opened = articles.indexOf(page.getByRole('article', { name: 'Aramsham' }));
    const follows = (node: Node) => Boolean(node.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING);
    await expect(follows(articles[opened]!)).toBe(true);
    await expect(follows(articles[opened + 1]!)).toBe(false);
    await expect(page.getByRole('link', { name: 'Open image file' })).toHaveAttribute(
      'href',
      resolveAsset('/image/leader/official/aramsham.png', 'large')
    );
    await userEvent.click(page.getByRole('button', { name: 'Close preview' }));
    await expect(page.queryByRole('link', { name: 'Open image file' })).toBeNull();
  },
});

/* Artwork the filters hide keeps its detail above the results. */
export const HiddenLeaderLink = meta.story({
  args: { path: '/media/game/leaders?item=%2Fimage%2Fleader%2Fofficial%2Faramsham.png&q=qqqqzzzz' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Aramsham' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('article', { name: 'Aramsham' })).toBeNull();
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

export const Catalogue = meta.story({
  args: { path: '/media' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByRole('link', { name: 'Leaders' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Decals' })).toHaveAttribute('href', '/media/game/decals');
    await expect(page.queryByRole('textbox', { name: 'Search media' })).toBeNull();
    await expect(page.queryByRole('link', { name: 'Textures' })).toBeNull();
    await expect(page.queryByRole('article')).toBeNull();
    /* No band: the name is there for screen readers, and the page opens on its galleries. */
    await expect(page.getByRole('heading', { level: 1, name: 'Media catalogue' })).toBeInTheDocument();
  },
});
export const VisualSearch = meta.story({
  args: { path: '/media/game/decals?q=crossed+knives' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('article', { name: 'Knives' })).resolves.toBeVisible();
    await expect(page.queryByRole('article', { name: 'Fremen' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Organize collections' })).toBeNull();
    await expect(page.queryByRole('link', { name: 'Link to this view' })).toBeNull();
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
export const LucideGallery = meta.story({
  args: { path: '/media/lucide?q=arrowbigdown' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    /* The icons load with their own chunk, and the count arrives with them. */
    await expect(page.findByText('ArrowBigDown')).resolves.toBeVisible();
    await expect(page.getByRole('status')).toHaveTextContent(/^\d+ matches$/u);
  },
});
export const LucideGalleryNoMatches = meta.story({
  args: { path: '/media/lucide?q=zzzz' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      page.findByText('No artwork matches these filters. Try fewer words or clear the filters.')
    ).resolves.toBeVisible();
    await expect(page.getByRole('status')).toHaveTextContent('No matches');
  },
});
export const TopicIconGallery = meta.story({
  args: { path: '/media/topics?q=group' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.findByText('groups')).resolves.toBeVisible();
    await expect(page.getByRole('status')).toHaveTextContent(/^\d+ matches$/u);
  },
});
