import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { SiteNavigation } from './SiteNavigation';
import type { NavLinkItem } from './SiteNavigation';

/* A deliberately oversized set: the system's contract is any count, any length, so the overflow
   stories feed it more than any width can hold. Labels are fake — only their widths matter. */
const manyLinks: readonly NavLinkItem[] = [
  { label: 'Factions', to: '/factions' },
  { label: 'Rulesets', to: '/rulesets' },
  { label: 'Profiles', to: '/profiles' },
  { label: 'Assets', to: '/assets' },
  { label: 'Battle Reports', to: '/factions' },
  { label: 'Events Calendar', to: '/rulesets' },
  { label: 'Community', to: '/profiles' },
  { label: 'Tournament Organizer Resources', to: '/assets' },
  { label: 'Errata & Clarifications', to: '/factions' },
  { label: 'Getting Started Guide', to: '/rulesets' },
  { label: 'Marketplace', to: '/profiles' },
];

const meta = preview.meta({
  component: SiteNavigation,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The priority-plus navigation row: links that fit stay visible, the rest collapse behind a More control, re-measured on resize — correct for any link count at any width. The gradient scrim behind it belongs to the row, so it travels into these stories. The account slot shows Login here because stories run signed out; the signed-in avatar menu has no story for the same reason.',
      },
    },
  },
});

/** The product's own link set at desktop width: everything fits, so no More control renders. */
export const AllLinksFit = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Positive first: once the measured row shows its last link, the absence check is meaningful.
    await waitFor(async () => {
      await expect(canvas.getByRole('link', { name: 'Assets' })).toBeVisible();
    });
    await expect(canvas.queryByRole('button', { name: /More/ })).toBeNull();
  },
});

/** More links than the width holds: the tail collapses behind More, the head stays visible. */
export const PartialOverflow = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { links: manyLinks },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: /More/ })).toBeVisible();
    });
    await expect(canvas.getByRole('link', { name: 'Factions' })).toBeVisible();
  },
});

/**
 * The More panel, opened.
 * It renders through a portal outside the canvas — the band hosting the nav is `overflow: hidden`, so an in-place panel would clip at compact band heights.
 */
export const OverflowPanelOpen = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { links: manyLinks },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const more = await waitFor(() => canvas.getByRole('button', { name: /More/ }));
    more.click();
    await waitFor(async () => {
      await expect(within(document.body).getByRole('link', { name: 'Marketplace' })).toBeVisible();
    });
  },
});

/** At phone width even the product's own set folds away — priority-plus degrades to a menu. */
export const CollapsedMobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole('button', { name: /More/ })).toBeVisible();
    });
  },
});
