import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { StoryWheel } from './battleWheel.stories.fixture';

const meta = testingPreview.meta({
  title: 'Tools/Battle wheel',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' }, motion: 'on' },
});

/** A faction found by search loads its leaders and troops onto the wheel, and stays one tap away. */
export const PicksAFactionFromSearch = meta.story({
  render: () => <StoryWheel name="testing-search" />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Ecaz' }));
    await expect(await within(canvasElement).findByText('Ecaz troop')).toBeVisible();
  },
});

/** Spice the troops no longer use is dropped, so it never comes back when troops are dialed again. */
export const DropsSpiceTheTroopsNoLongerUse = meta.story({
  render: () => (
    <StoryWheel
      name="testing-spice"
      setup={{ rulesetId: 'gf9', faction: 'emperor', leader: false, troops: [0, 3], spice: 3 }}
    />
  ),
  play: async ({ canvas }) => {
    const fewer = canvas.getByRole('button', { name: 'Fewer: Saudarkar' });
    await userEvent.click(fewer);
    await userEvent.click(fewer);
    await userEvent.click(canvas.getByRole('button', { name: 'More: Saudarkar' }));
    await userEvent.click(canvas.getByRole('button', { name: 'More: Saudarkar' }));
    await expect(canvas.getByText('Pays 1 spice')).toBeVisible();
  },
});
