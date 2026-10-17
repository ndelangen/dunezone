import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { LoadPending } from './LoadPending';

const meta = preview.meta({
  component: LoadPending,
  parameters: { layout: 'padded' },
  args: { title: 'Loading faction', children: 'The faction details are still loading.' },
});

/** A page waiting for its own subject. The heading names what is coming, the sentence says it is still on its way, and both are announced. */
export const Pending = meta.story({
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole('status');
    await expect(within(status).getByRole('heading', { name: 'Loading faction' })).toBeVisible();
    await expect(within(status).getByText('The faction details are still loading.')).toBeVisible();
  },
});
