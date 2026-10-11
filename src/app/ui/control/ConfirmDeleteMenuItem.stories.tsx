import { Menu } from '@mantine/core';
import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ConfirmDeleteMenuItem } from './ConfirmDeleteMenuItem';

const meta = preview.meta({
  component: ConfirmDeleteMenuItem,
  parameters: { layout: 'centered' },
  args: { label: 'Hold to delete permanently', onConfirm: fn() },
  render: (args) => (
    <Menu opened withinPortal={false}>
      <Menu.Target>
        <span />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item>Peek</Menu.Item>
        <ConfirmDeleteMenuItem {...args} />
      </Menu.Dropdown>
    </Menu>
  ),
});

/** The resting item: a plain click fires nothing, which its own words explain. */
export const Default = meta.story({});

/** Mid-hold the item's words become the countdown, and the item keeps its resting width so the pointer stays on it. */
export const Holding = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement);
    const item = await waitForFrame(() =>
      finishTransitions(page.getByRole('menuitem', { name: 'Hold to delete permanently' }))
    );
    await expect(item).toBeVisible();
    const width = item.getBoundingClientRect().width;

    await userEvent.pointer([{ keys: '[MouseLeft>]', target: item }]);
    await expect(item).toHaveFocus();
    await waitForFrame(() => expect(page.getByText('Deleting in 5..')).toBeVisible());
    await expect(item.getBoundingClientRect().width).toBe(width);
    await userEvent.pointer([{ keys: '[/MouseLeft]', target: item }]);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** A disabled item, for a piece that cannot be deleted right now. */
export const Disabled = meta.story({ args: { disabled: true } });
