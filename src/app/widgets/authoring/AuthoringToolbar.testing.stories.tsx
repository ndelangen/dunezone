import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { AuthoringToolbar } from './AuthoringToolbar';
import { cleanStatus, factionCopy, cleanToolbar } from './AuthoringToolbar.stories.fixture';

const meta = testingPreview.meta({
  title: 'Authoring Toolbar',
  component: AuthoringToolbar,
  args: cleanToolbar,
  parameters: {
    layout: 'fullscreen',
  },
});

/** A blank name blocks Save: it looks disabled, says why on hover, and pressing it does nothing. */
export const NameBlank = meta.story({
  args: { ...cleanToolbar, status: { ...cleanStatus, isDirty: true, isNameBlank: true } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const save = page.getByRole('button', { name: 'Save faction' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(save);
    await expect(
      await waitForFrame(() => page.getByRole('tooltip', { name: factionCopy.nameBlankMessage }))
    ).toBeInTheDocument();
  },
});
