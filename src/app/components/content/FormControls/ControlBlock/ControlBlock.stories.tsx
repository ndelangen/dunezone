import { ActionIcon, Box, Select } from '@mantine/core';
import preview from '@sb/preview';
import { Minus, Plus } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { ControlBlock } from './ControlBlock';

const input = (
  <Select
    aria-label="Preferred player color"
    data={['Green', 'Teal', 'Orange']}
    defaultValue="Green"
    allowDeselect={false}
  />
);

const tool = (
  <ActionIcon.Group>
    <ActionIcon type="button" variant="light" color="red" size="sm" aria-label="Remove color">
      <Minus size={16} aria-hidden />
    </ActionIcon>
    <ActionIcon type="button" variant="filled" color="green" size="sm" aria-label="Add color">
      <Plus size={16} aria-hidden />
    </ActionIcon>
  </ActionIcon.Group>
);

const meta = preview.meta({
  title: 'Form Controls/Control Block',
  component: ControlBlock,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    input: { control: false },
    tool: { control: false },
  },
  args: {
    title: 'Tabletop Simulator colors',
    description: 'Choose unique colors; drag to set their priority.',
    tool,
    input,
  },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('group', { name: 'Tabletop Simulator colors' })
    ).toHaveAccessibleDescription('Choose unique colors; drag to set their priority.');
    await expect(canvas.getByRole('combobox', { name: 'Preferred player color' })).toBeVisible();
  },
});

export const WithoutTool = meta.story({
  args: {
    tool: undefined,
  },
});

const longTitle = 'Tabletop Simulator colors ordered by player priority and availability';
const longDescription =
  'Choose unique colors for every player position, then drag the rows to set their preferred priority.';

export const TruncatedText = meta.story({
  args: {
    title: longTitle,
    description: longDescription,
  },
  render: (args) => (
    <Box w={280}>
      <ControlBlock {...args} />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const title = canvas.getByText(longTitle);
    const description = canvas.getByText(longDescription);

    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    await expect(description.scrollWidth).toBeGreaterThan(description.clientWidth);

    await userEvent.hover(title);
    await expect(page.getByRole('tooltip')).toHaveTextContent(longTitle);

    await userEvent.unhover(title);
    await userEvent.hover(description);
    await expect(page.getByRole('tooltip')).toHaveTextContent(longDescription);
  },
});
