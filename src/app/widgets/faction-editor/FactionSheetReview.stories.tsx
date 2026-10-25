import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { ReviewFixture, openReview, storyFaction } from './FactionSheetReview.stories.fixture';

const meta = preview.meta({
  component: ReviewFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

/* Both sheet-page tiles of an open review, by the titles their preview frames carry. */
function sheetPageBounds(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  return [1, 2].map((pageNumber) => page.getByTitle(`Faction sheet page ${pageNumber}`).getBoundingClientRect());
}

export const DesktopHorizontal = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appLarge',
    },
  },
  /* The two pages sit side by side. */
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const [first, second] = sheetPageBounds(canvasElement);
    await expect(Math.abs(first!.top - second!.top)).toBeLessThan(2);
    await expect(second!.left).toBeGreaterThanOrEqual(first!.right - 1);
  },
});

export const ConstrainedStacked = meta.story({
  args: {
    faction: storyFaction,
  },
  globals: {
    viewport: {
      value: 'appConstrained',
    },
  },
  /* The second page stacks under the first. */
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const [first, second] = sheetPageBounds(canvasElement);
    await expect(Math.abs(first!.left - second!.left)).toBeLessThan(2);
    await expect(second!.top).toBeGreaterThanOrEqual(first!.bottom - 1);
  },
});

/**
 * A faction with no karama rules, no troops and no leaders has no second sheet page.
 * The review offers one tile rather than a second one showing the first page again under a page-2 label.
 */
const singlePageFaction: Faction = {
  ...storyFaction,
  leaders: [],
  troops: [],
  rules: { ...storyFaction.rules, advantages: [] },
};

export const WithoutASecondPage = meta.story({
  args: {
    faction: singlePageFaction,
  },
  globals: {
    viewport: {
      value: 'appLarge',
    },
  },
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTitle('Faction sheet page 1')).toBeInTheDocument();
    await expect(page.queryByTitle('Faction sheet page 2')).toBeNull();
    await expect(page.queryByText('Scroll for page 2')).toBeNull();
  },
});

export const LongContent = meta.story({
  args: {
    faction: storyFaction,
    longContent: true,
  },
  /* However long the editor runs, the review panel stays inside the editor document rather than hanging past its end. */
  play: async ({ canvasElement }) => {
    await openReview(canvasElement);
    const stage = canvasElement.querySelector('[data-faction-sheet-review]');
    const panel = within(canvasElement.ownerDocument.body).getByRole('complementary');
    await waitForFrame(() =>
      expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual((stage?.getBoundingClientRect().bottom ?? 0) + 1)
    );
  },
});
