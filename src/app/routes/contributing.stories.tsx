import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Contributing',
  ...pageStoryMeta,
});

/** The guide's front page: what each sub-page covers, what the app is built from and how to run it. */
export const Overview = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Contributing' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findAllByRole('link', { name: /Technical glossary/ })).resolves.not.toHaveLength(0);
  },
});

export const Code = meta.story({ args: { path: '/contributing/code' } });

export const Deployment = meta.story({ args: { path: '/contributing/deployment' } });

/** The technical glossary, found by the word it replaces: PageHead finds the page header. */
export const Glossary = meta.story({
  args: { path: '/contributing/glossary' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Tint' }, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: 'Search the technical glossary' }), 'PageHead');
    await expect(page.findByRole('heading', { name: 'Page header' })).resolves.toBeVisible();
    await expect(page.queryByRole('heading', { name: 'Tint' })).toBeNull();
    const guide = page.getByRole('navigation', { name: 'On this page' });
    await expect(within(guide).getByRole('link', { name: 'Parts of a page' })).toBeVisible();
    await expect(within(guide).queryByRole('link', { name: 'Boards and the Play table' })).toBeNull();
  },
});

export const DesignDecisions = meta.story({ args: { path: '/contributing/design-decisions' } });

export const Navigation = meta.story({
  args: { path: '/contributing' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const code = await page.findByRole('tab', { name: 'How the code works' }, { timeout: 30_000 });
    await userEvent.click(code);
    await expect(page.findByRole('heading', { name: 'How the code works' })).resolves.toBeVisible();
    await expect(page.getByRole('tab', { name: 'How the code works' })).toHaveAttribute('aria-selected', 'true');
  },
});
