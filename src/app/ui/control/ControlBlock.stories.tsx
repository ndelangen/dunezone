import { Box, Select, TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, fn, userEvent, within } from 'storybook/test';

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
    backgrounds: { value: 'dark', grid: false },
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
    await waitForFrame(() =>
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
    <Box w={280} data-testid="resizable-field">
      <ControlBlock {...args} />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const title = canvas.getByText(longTitle);

    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);

    await userEvent.hover(title);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent(longTitle));

    /* The hovered title changes width with its pane; the tooltip follows its target after resize. */
    const field = canvas.getByTestId('resizable-field');
    const originalWidth = field.style.width;
    const originalMargin = field.style.marginLeft;
    const originalLeft = title.getBoundingClientRect().left;
    field.style.width = '180px';
    field.style.marginLeft = '80px';
    try {
      await waitForFrame(async () => {
        const target = title.getBoundingClientRect();
        const tooltip = page.getByRole('tooltip').getBoundingClientRect();
        await expect(target.left).not.toBe(originalLeft);
        await expect(Math.abs(tooltip.left - target.left)).toBeLessThan(1);
      });
    } finally {
      field.style.width = originalWidth;
      field.style.marginLeft = originalMargin;
    }
  },
});

/** The title names the input it is handed, so the input carries no `aria-label` of its own. */
export const NamesItsInput = meta.story({
  args: {
    tool: undefined,
    title: 'Preferred player color',
    input: (field) => (
      <Select {...field} data={['Green', 'Teal', 'Orange']} defaultValue="Green" allowDeselect={false} />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Preferred player color' })).toBeVisible();
  },
});

/** A value that is allowed but probably not meant: one caution line under the input, which it describes. */
export const WithWarning = meta.story({
  args: {
    tool: undefined,
    description: 'Printed around this leader token.',
    title: 'Leader name',
    warning: 'This leader has no name. This is advisory and does not prevent saving.',
    input: (field) => <TextInput {...field} defaultValue="" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Leader name' });
    await expect(input).toHaveAccessibleDescription(
      'This leader has no name. This is advisory and does not prevent saving.'
    );
    await expect(canvas.getByRole('status')).toHaveTextContent('This leader has no name.');
  },
});
