import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { TOOLS } from './_app/tools/tools';
import { expectWithinWidth } from './pagePlay';
import { findTitledPage } from './site.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tools',
  args: { path: '/tools' },
});

/** Every tool as a tutorial-style tile in rows by when a table reaches for it; a tool not yet built says coming soon and opens its placeholder page. */
export const Catalogue = meta.story({
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Tools$/);
    await expect(page.getByRole('list', { name: 'Before the game' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'During the game' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Make and export' })).toBeVisible();
    await expect(page.getAllByRole('listitem')).toHaveLength(TOOLS.length);
    await expect(page.getAllByText('Coming soon')).toHaveLength(TOOLS.filter((tool) => !tool.built).length);
    await expect(page.getByRole('link', { name: 'Treachery tracker' })).toHaveAttribute(
      'href',
      '/tools/atreides-treachery-tracker'
    );
  },
});

/** The catalogue at phone width, where the tools are used: one tile across, nothing pushing the page sideways. */
export const CataloguePhone = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Tools$/);
    await expectWithinWidth(canvasElement, page.getAllByRole('listitem'));
  },
});

/** A planned tool's page: what it will do, a way back to every tool, and where to follow it or share an idea. */
export const ComingSoon = meta.story({
  args: { path: '/tools/battle-calculator' },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Battle calculator$/);
    await expect(page.getByRole('heading', { name: 'What it will do' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All tools' })).toHaveAttribute('href', '/tools');
  },
});

/** The Treachery tracker's placeholder links the issue where it is being planned. */
export const ComingSoonWithIssue = meta.story({
  args: { path: '/tools/atreides-treachery-tracker' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('link', { name: 'Follow its progress' }, { timeout: 30_000 })
    ).resolves.toHaveAttribute('href', 'https://github.com/ndelangen/dunezone/issues/2795');
  },
});

/** The same page at phone width. */
export const ComingSoonPhone = meta.story({
  args: { path: '/tools/faction-draft' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Faction draft$/);
    await expectWithinWidth(canvasElement, [page.getByRole('link', { name: 'Share an idea' })]);
  },
});
