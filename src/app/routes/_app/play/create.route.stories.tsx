import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { creatable, chooseRuleset, typeCustomName } from './create.route.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Create a game', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      /* Signing in returns the reader to the page they asked from. */
      '/auth/login?redirect=%2Fplay%2Fcreate'
    );
    await expect(page.queryByRole('button', { name: 'Create game' })).toBeNull();
  },
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
