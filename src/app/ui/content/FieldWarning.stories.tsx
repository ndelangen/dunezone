import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FieldWarning } from './FieldWarning';

const meta = preview.meta({
  component: FieldWarning,
  parameters: { layout: 'padded' },
  args: {
    id: 'leader-name-warning',
    children: 'This leader has no name. This is advisory and does not prevent saving.',
  },
});

/** One caution line, announced as it appears. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('This leader has no name.');
  },
});
