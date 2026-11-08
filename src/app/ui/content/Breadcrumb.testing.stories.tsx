import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { Breadcrumb } from './Breadcrumb';

const meta = testingPreview.meta({
  component: Breadcrumb,
  render: () => <Breadcrumb to="/assets">Assets</Breadcrumb>,
});

/** The breadcrumb is a real link to the page one level up, named by that page. */
export const LinksUp = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Assets' })).toHaveAttribute('href', '/assets');
  },
});
