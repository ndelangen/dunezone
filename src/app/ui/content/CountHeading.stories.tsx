import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { CountHeading } from './CountHeading';

const meta = preview.meta({
  component: CountHeading,
  parameters: { layout: 'padded' },
  args: { label: 'Seats at the table', value: 6 },
});

/** The caption on the left, the count large on the right; the figure is hidden, since the control beneath says it. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('6')).toHaveAttribute('aria-hidden', 'true');
  },
});

/** Two digits keep the same width per digit, so the figure does not jitter as a slider moves. */
export const TwoDigits = meta.story({ args: { label: 'Last turn', value: 10 } });
