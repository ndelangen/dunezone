import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

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
    await expect(page.getByRole('link', { name: 'Meet the dreamers' })).toHaveAttribute('href', '/groups/dreamers');
    await expect(page.queryByRole('link', { name: 'Play now' })).toBeNull();
  },
});

export const SneakPeekLink = meta.story({
  beforeEach: () => {
    window.location.hash = '#play-preview';
    return () => {
      window.location.hash = '';
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Try moving one of the pieces!')).resolves.toBeInTheDocument();
    /* With room for it, the preview mounts the live table's scene in place of the still. */
    const preview = canvasElement.ownerDocument.getElementById('play-preview');
    await waitFor(() => expect(preview?.querySelector('canvas')).toBeInstanceOf(HTMLCanvasElement), {
      timeout: 30_000,
    });
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
    await expect(page.findByRole('heading', { name: 'Your next game is taking shape.' })).resolves.toBeVisible();
    const preview = canvasElement.ownerDocument.getElementById('play-preview');
    await expect(preview).toBeVisible();
    await expect(preview?.closest('[data-homepage-motion]')).toHaveAttribute('data-homepage-motion', 'off');
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(page.getByText('A development preview of the new table. Play is not available yet.')).toBeVisible();
    await expect(page.getByText('Open this page on a larger screen to try the live preview.')).toBeVisible();
    await expect(page.findByRole('img', { name: /The Dune Play board/ })).resolves.toBeInTheDocument();
    await expect(preview?.querySelector('canvas')).toBeNull();
  },
});
