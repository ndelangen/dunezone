import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { creatable, chooseRuleset, typeCustomName } from './create.route.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
});

/** A reserved address is advice, never a validation error. */
export const DuplicateName = meta.story({
  parameters: creatable,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await chooseRuleset(page);
    await typeCustomName(page, 'Arrakeen picnic');
    await expect(page.findByText(/You can keep the name/, {}, { timeout: 10_000 })).resolves.toBeVisible();
    await expect(page.getByLabelText('Custom name')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Create game' })).toBeEnabled();
  },
});
