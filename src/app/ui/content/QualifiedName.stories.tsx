import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { QualifiedName } from './QualifiedName';

const meta = preview.meta({
  component: QualifiedName,
  parameters: { layout: 'padded' },
  args: { name: 'House Atreides', qualifier: 'Classic' },
  decorators: [
    (Story) => (
      <Text size="sm" fw={700} w={280}>
        {Story()}
      </Text>
    ),
  ],
});

/** The qualifier follows the name after a dot, dimmed and in a regular weight. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Classic/)).toBeVisible();
  },
});

/** A long qualifier wraps, and the dot goes to the next line with it. */
export const Wraps = meta.story({
  args: { qualifier: 'Advanced co-existence with spiritual advisors' },
});
