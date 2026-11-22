import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FetchProgress } from './FetchProgress';

const meta = preview.meta({
  component: FetchProgress,
  parameters: { layout: 'padded' },
  args: { label: 'Fetching the cards' },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
});

/** Part way: 9 of 24 pictures in. */
export const PartWay = meta.story({
  args: { done: 9, total: 24 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('progressbar', { name: 'Fetching the cards' })).toHaveValue(9);
  },
});

/** Before the count is known: the bar only says it is busy. */
export const Busy = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('progressbar', { name: 'Fetching the cards' })).not.toHaveAttribute(
      'value'
    );
  },
});
