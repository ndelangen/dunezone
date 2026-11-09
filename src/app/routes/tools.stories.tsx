import preview from '@sb/preview';
import { expect } from 'storybook/test';

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
    /* A built tool is a page of its own, so it opens in a tab of its own. */
    await expect(page.getByRole('link', { name: 'Treachery tracker' })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'Battle calculator' })).not.toHaveAttribute('target');
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

/** The Treachery tracker, the first built tool, on a phone and without the app around it: the Ruleset and its factions to set up, then Start tracking. */
export const TreacheryTracker = meta.story({
  args: { path: '/tools/atreides-treachery-tracker' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Treachery tracker$/);
    await expect(page.findByRole('button', { name: 'Start tracking' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('banner')).toBeNull();
    await expect(page.queryByRole('contentinfo')).toBeNull();
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
