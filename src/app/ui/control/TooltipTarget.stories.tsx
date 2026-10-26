import { Button, Tooltip } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { TooltipTarget } from './TooltipTarget';

const meta = preview.meta({
  component: TooltipTarget,
  parameters: { layout: 'centered' },
  args: { children: <Button disabled>Take a seat</Button> },
  render: (args) => (
    <Tooltip label="Seats are locked while the game starts">
      <TooltipTarget {...args} />
    </Tooltip>
  ),
});

/** A disabled button still shows why it is disabled when the pointer rests on it. */
export const DisabledControl = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const button = canvas.getByRole('button', { name: 'Take a seat' });
    await expect(button).toBeDisabled();
    await userEvent.hover(button.parentElement!);
    await waitForFrame(() =>
      expect(page.getByRole('tooltip')).toHaveTextContent('Seats are locked while the game starts')
    );
  },
});
