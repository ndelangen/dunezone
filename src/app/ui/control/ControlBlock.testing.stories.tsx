import { Switch } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { ControlBlock } from './ControlBlock';

const meta = testingPreview.meta({
  title: 'Control Block',
  component: ControlBlock,
  args: {
    inline: true,
    title: 'Announce private messages',
    input: (field) => <Switch {...field} />,
  },
});

/* An inline switch is still named by the title, so a click on the title turns it on. */
export const InlineSwitchTitleToggles = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Announce private messages' });
    await userEvent.click(canvas.getByText('Announce private messages'));
    await expect(toggle).toBeChecked();
  },
});
