import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { TruncatedText } from './TruncatedText';

const longName = 'Treachery cards with the Harkonnen house artwork and gold trim';

const meta = preview.meta({
  component: TruncatedText,
  parameters: { layout: 'centered' },
  args: { children: longName, size: 'sm' },
  render: (args) => (
    <Box w={220}>
      <TruncatedText {...args} />
    </Box>
  ),
});

/** Cut short by its box, the name ends in an ellipsis and hovering shows the whole of it. */
export const Truncated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const text = canvas.getByText(longName);
    await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
    await userEvent.hover(text);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent(longName));
  },
});

/** Text that fits shows no tooltip and takes no focus. */
export const Fits = meta.story({
  args: { children: 'Treachery' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const text = canvas.getByText('Treachery');
    await expect(text).not.toHaveAttribute('tabindex');
    await userEvent.hover(text);
    await expect(page.queryByRole('tooltip')).not.toBeInTheDocument();
  },
});
