import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Lobby',
  args: { path: '/play' },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Game lobby', level: 1 })).resolves.toBeVisible();
    expect(page.getByText('The game lobby is not available yet.')).toBeVisible();
    expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(page.queryByRole('link', { name: /demo/i })).toBeNull();
  },
});
