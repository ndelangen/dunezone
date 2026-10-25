import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Home',
  ...pageStoryMeta,
});

/** The homepage's primary action stays distinct against the sandy header artwork. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Take a sneak peek' })).resolves.toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector('[data-live-ready="true"]')).not.toBeNull(), {
      timeout: 30_000,
    });
  },
});
