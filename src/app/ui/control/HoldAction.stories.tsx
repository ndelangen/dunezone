import { Button, Menu } from '@mantine/core';
import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { install } from '@sinonjs/fake-timers';
import { UserMinus } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { HoldAction } from './HoldAction';
import type { HoldActionProps } from './HoldAction';
import { HOLD_SECONDS } from './useHoldToConfirm';

const meta = preview.meta({
  component: HoldAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  args: {
    label: 'Delete faction',
    pending: false,
    onConfirm: fn(),
  },
});

function InMenu(args: HoldActionProps) {
  return (
    <Menu opened withinPortal={false}>
      <Menu.Target>
        <Button variant="default">Piece</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item>Peek</Menu.Item>
        <HoldAction {...args} />
      </Menu.Dropdown>
    </Menu>
  );
}

/** One red glyph among the other toolbar actions, named for people who cannot see it. Hovering says "hold to delete". */
export const Default = meta.story({});

/** Taking a thing out of somewhere rather than out of existence: same hold, its own glyph and words ("removal in 4.."). */
export const Remove = meta.story({
  args: { label: 'Remove member', verb: 'remove', icon: <UserMinus size={17} aria-hidden /> },
});

/** An irreversible conversion. The hover text spells out what is kept and that it cannot be undone. */
export const Convert = meta.story({
  args: {
    label: 'Convert to custom card',
    verb: 'convert',
    hint: 'Hold to convert to a custom card. Keeps its decks and owner. This cannot be reversed.',
  },
});

/** One violet glyph, the only one on the page: publishing is neither saving nor creating. Hovering says "hold to publish". */
export const Publish = meta.story({
  args: { label: 'Publish Edition 4', verb: 'publish' },
});

/** Nothing to publish: the trigger looks disabled but still says why on hover, and holding it does nothing. */
export const PublishUnavailable = meta.story({
  args: { label: 'Publish Edition 4', verb: 'publish', disabledReason: 'Save your changes before publishing.' },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Publish Edition 4' });
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');

    await userEvent.hover(trigger);
    await expect(
      await waitForFrame(() => page.getByRole('tooltip', { name: 'Save your changes before publishing.' }))
    ).toBeInTheDocument();
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** The full-width shape, for deletions heavy enough to be a labelled button rather than a toolbar glyph. */
export const AsButton = meta.story({
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { label: 'Delete account', shape: 'button' },
});

/**
 * Mid-hold, a button's label itself becomes the countdown, so words already on screen carry the state instead of a second indicator.
 * The first second shows on the press itself, before any tick, which is what makes it assertable here without waiting.
 */
export const AsButtonHolding = meta.story({
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { label: 'Delete account', shape: 'button' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Delete account' });

    await userEvent.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await expect(trigger).toHaveTextContent('deletion in 5..');
    await userEvent.pointer([{ keys: '[/MouseLeft]', target: trigger }]);
  },
});

/** The menu shape: the item's own words explain why a plain click fires nothing. */
export const AsMenuItem = meta.story({
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { label: 'Hold to delete permanently', shape: 'menu-item' },
  render: (args) => <InMenu {...args} />,
});

/** Mid-hold the item's words become the countdown, and the item keeps its resting width so the pointer stays on it. */
export const AsMenuItemHolding = meta.story({
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { label: 'Hold to delete permanently', shape: 'menu-item' },
  render: (args) => <InMenu {...args} />,
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
export const AsMenuItemDisabled = meta.story({
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { label: 'Hold to delete permanently', shape: 'menu-item', disabled: true },
  render: (args) => <InMenu {...args} />,
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement);
    const item = page.getByRole('menuitem', { name: 'Hold to delete permanently' });
    await expect(item).toBeDisabled();

    /* The whole five-second hold passes on a fake clock: an enabled item would have fired, a disabled one still reads its resting words. */
    const clock = install({ toFake: ['setInterval', 'clearInterval'], shouldClearNativeTimers: true });
    try {
      await userEvent.pointer([{ keys: '[MouseLeft>]', target: item }], { pointerEventsCheck: 0 });
      await clock.tickAsync(HOLD_SECONDS * 1000);
      await expect(args.onConfirm).not.toHaveBeenCalled();
      await expect(page.getByText('Deleting in 5..')).not.toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Hold to delete permanently' })).toBeVisible();
    } finally {
      await userEvent.pointer([{ keys: '[/MouseLeft]', target: item }], { pointerEventsCheck: 0 });
      clock.uninstall();
    }
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});
