import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { SubmitAction } from './SubmitAction';

const meta = preview.meta({
  component: SubmitAction,
  parameters: { layout: 'padded' },
  args: {
    children: 'Save group',
    pending: false,
  },
});

/** Ready to commit. The confirm colour marks it as the positive action. */
export const Default = meta.story({});

/**
 * In flight: the label becomes progress and the button latches, so an impatient second click cannot submit the same form twice.
 */
export const Pending = meta.story({
  args: { pending: true },
  /* Beside it, a caller's own label for where "Saving…" would misdescribe the work. */
  render: (args) => (
    <Group gap="xs">
      <SubmitAction {...args} />
      <SubmitAction {...args} pendingLabel="Publishing…">
        Publish faction
      </SubmitAction>
    </Group>
  ),
  play: async ({ canvasElement }) => {
    const [saving, publishing] = canvasElement.querySelectorAll('button');

    await expect(saving).toBeDisabled();
    await expect(saving?.textContent).toContain('Saving…');
    await expect(publishing).toBeDisabled();
    await expect(publishing?.textContent).toContain('Publishing…');
  },
});
