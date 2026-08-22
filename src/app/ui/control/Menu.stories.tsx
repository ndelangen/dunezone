import { Menu } from '@mantine/core';
import preview from '@sb/preview';
import { EllipsisVertical, Link2Off, Pencil, Star } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { IconAction } from './IconAction';

const meta = preview.meta({
  component: Menu,
  parameters: { layout: 'centered' },
  args: { position: 'bottom-end', shadow: 'md', withinPortal: true },
});

const trigger = (
  <Menu.Target>
    <IconAction
      label="Actions for House Atreides"
      variant="light"
      color="gray"
      size="sm"
      icon={<EllipsisVertical size={15} aria-hidden />}
    />
  </Menu.Target>
);

/** One destructive choice, the shape a list item's menu usually takes. `color="red"` is how a destructive choice reads. */
export const Default = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const target = page.getByRole('button', { name: 'Actions for House Atreides' });

    await userEvent.click(target);

    await expect(target).toHaveAttribute('aria-haspopup', 'menu');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Remove from Dreamrules' })).toBeVisible());
  },
});

/** Several choices, with the destructive one set apart and a divider above it. */
export const SeveralChoices = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Item leftSection={<Star size={15} aria-hidden />}>Feature on the page</Menu.Item>
        <Menu.Item leftSection={<Pencil size={15} aria-hidden />}>Edit this faction</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
});

/** A choice that is present but unavailable stays visible, so its absence is never a mystery. */
export const DisabledChoice = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Item leftSection={<Pencil size={15} aria-hidden />}>Edit this faction</Menu.Item>
        <Menu.Item disabled color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
});

/** A labelled group, for a menu long enough to need sections. */
export const WithLabel = meta.story({
  render: (args) => (
    <Menu {...args}>
      {trigger}
      <Menu.Dropdown>
        <Menu.Label>This ruleset</Menu.Label>
        <Menu.Item color="red" leftSection={<Link2Off size={15} aria-hidden />}>
          Remove from Dreamrules
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ),
});
