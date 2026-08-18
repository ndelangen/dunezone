import { Box, Select } from '@mantine/core';
import preview from '@sb/preview';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { ControlBlock } from './ControlBlock';
import { ListLengthActions } from './ListLengthActions';

const input = (
  <Select
    aria-label="Preferred player color"
    data={['Green', 'Teal', 'Orange']}
    defaultValue="Green"
    allowDeselect={false}
  />
);

const tool = <ListLengthActions removeLabel="Remove color" addLabel="Add color" onRemove={fn()} onAdd={fn()} />;

const meta = preview.meta({
  title: 'Control Block',
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
    const page = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('group', { name: 'Tabletop Simulator colors' })).toHaveAccessibleDescription(
      'Choose unique colors; drag to set their priority.'
    );
    await expect(canvas.getByRole('combobox', { name: 'Preferred player color' })).toBeVisible();

    await userEvent.hover(canvas.getByRole('img', { name: 'Help' }));
    await waitFor(() =>
      expect(page.getByRole('tooltip')).toHaveTextContent('Choose unique colors; drag to set their priority.')
    );
  },
});

export const WithoutTool = meta.story({
  args: {
    tool: undefined,
  },
});

export const WithoutDescription = meta.story({
  args: {
    description: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('img', { name: 'Help' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('group', { name: 'Tabletop Simulator colors' })).not.toHaveAttribute(
      'aria-describedby'
    );
  },
});

const longTitle = 'Tabletop Simulator colors ordered by player priority and availability';

export const TruncatedTitle = meta.story({
  args: {
    title: longTitle,
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

    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);

    await userEvent.hover(title);
    await waitFor(() => expect(page.getByRole('tooltip')).toHaveTextContent(longTitle));
  },
});
