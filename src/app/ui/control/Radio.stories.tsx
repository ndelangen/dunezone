import { Group, Radio, VisuallyHidden } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

const meta = preview.meta({
  component: Radio.Group<string>,
  parameters: { layout: 'centered' },
  args: {
    label: <VisuallyHidden>Color mode</VisuallyHidden>,
    defaultValue: 'solid',
    children: (
      <Group gap="lg" wrap="wrap">
        <Radio value="solid" label="Solid" />
        <Radio value="linear" label="Linear" />
        <Radio value="radial" label="Radial" />
      </Group>
    ),
  },
});

export const Selected = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Solid' })).toBeChecked();
    await userEvent.click(canvas.getByRole('radio', { name: 'Linear' }));
    await expect(canvas.getByRole('radio', { name: 'Linear' })).toBeChecked();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', { name: 'Radial' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Radial' })).toHaveFocus();
  },
});
