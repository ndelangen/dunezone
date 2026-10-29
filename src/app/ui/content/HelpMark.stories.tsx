import { Group, Text } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { HelpMark } from './HelpMark';

const meta = preview.meta({
  component: HelpMark,
  parameters: { layout: 'centered' },
  args: { text: 'Messages to every seated faction.' },
  render: (args) => (
    <Group gap={6} wrap="nowrap">
      <Text fw={600}>Table chat</Text>
      <HelpMark {...args} />
    </Group>
  ),
});

/** Hovering the glyph shows the words; tabbing to it does the same for a keyboard reader. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const mark = canvas.getByRole('img', { name: 'Help' });
    await expect(mark).toHaveAccessibleDescription('Messages to every seated faction.');
    await userEvent.hover(mark);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('Messages to every seated faction.'));
    await expect(canvasElement.ownerDocument.defaultView!.getComputedStyle(page.getByRole('tooltip')).whiteSpace).toBe(
      'pre-line'
    );
  },
});
