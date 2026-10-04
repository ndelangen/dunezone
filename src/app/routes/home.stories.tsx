import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { setMotionOverride } from '@app/styles/motion';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Home',
  ...pageStoryMeta,
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { level: 1, name: 'Dune Play is coming soon' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Take a sneak peek' })).toHaveAttribute('href', '#play-preview');
    await expect(page.getByRole('link', { name: 'Write your own' })).toHaveAttribute('href', '/rulesets/create');
    await expect(page.getByRole('link', { name: 'Form an alliance' })).toHaveAttribute('href', '/groups/create');
    expect(page.queryByRole('link', { name: 'Play now' })).toBeNull();
  },
});

export const QuietMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  beforeEach: () => {
    setMotionOverride('off');
    return () => setMotionOverride(null);
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const board = await page.findByRole('img', { name: /current Dune Play board/ });
    await expect(board).toBeVisible();
    expect(getComputedStyle(board.parentElement!).animationName).toBe('none');
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(page.getByText('A development preview of the new table. Play is not available yet.')).toBeVisible();
  },
});
