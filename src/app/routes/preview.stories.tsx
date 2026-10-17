import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Preview',
  ...pageStoryMeta,
});

/** The print route draws the stored faction's sheet at page size. */
export const FactionSheet = meta.story({
  args: { path: '/preview/sheet/house-atreides?mode=db' },
  globals: { viewport: { value: 'page' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [name] = await page.findAllByText(/^House Atreides$/i, {}, { timeout: 30_000 });
    await expect(name).toBeVisible();
    await expect(page.getByText(/Start with 10 spice/)).toBeVisible();
    await expect(page.getByText(/^Advantages$/i)).toBeVisible();
  },
});
