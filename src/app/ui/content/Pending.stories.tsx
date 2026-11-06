import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { Pending } from './Pending';

const meta = preview.meta({
  component: Pending,
  parameters: { layout: 'padded' },
  args: { children: 'Loading factions' },
});

/** A spinner and what it is waiting for, announced to assistive tech. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Loading factions');
  },
});
