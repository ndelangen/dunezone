import { Button, Menu, Stack, Text } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { install } from '@sinonjs/fake-timers';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { HoldAction } from './HoldAction';
import type { HoldActionProps } from './HoldAction';
import { HOLD_SECONDS } from './useHoldToConfirm';

/* How a loading or disabled trigger looks is IconAction's and Button's own story; these check that the hold turns them on (ADR-0005). */
const meta = testingPreview.meta({
  title: 'HoldAction',
  component: HoldAction,
  parameters: { layout: 'centered' },
  args: {
    label: 'Delete faction',
    pending: false,
    onConfirm: fn(),
  },
});

/** While the deletion is in flight the trigger latches, so an impatient second hold cannot fire it twice. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Mantine's loading state disables the button, which is the latch made visible. */
    await expect(page.getByRole('button', { name: 'Delete faction' })).toBeDisabled();
  },
});

/** Resting the pointer says the trigger is held, and a plain click fires nothing: the words that explain a click's silence. */
export const SaysHoldOnHover = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Delete faction' });
    await userEvent.hover(trigger);
    await expect(await page.findByRole('tooltip')).toHaveTextContent('hold to delete');
    await userEvent.click(trigger);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** A conversion in flight latches like a deletion. */
export const ConvertPending = meta.story({
  args: { label: 'Convert to custom card', verb: 'convert', pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Convert to custom card' })).toBeDisabled();
  },
});

/** The button shape latches while the caller's mutation is in flight. */
export const ButtonPending = meta.story({
  args: { label: 'Delete account', shape: 'button', pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button')).toBeDisabled();
  },
});

/**
 * Gated on a precondition the caller owns, such as an unacknowledged checkbox.
 * Distinct from `pending`: nothing is running, the hold is not available yet.
 */
export const ButtonDisabled = meta.story({
  args: { label: 'Delete account', shape: 'button', disabled: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeDisabled();
  },
});

/** The button shape says it is held too. */
export const ButtonSaysHoldOnHover = meta.story({
  args: { label: 'Delete account', shape: 'button' },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Delete account' });
    await userEvent.hover(trigger);
    await expect(await page.findByRole('tooltip')).toHaveTextContent('hold to delete');
    await userEvent.click(trigger);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** Publishing says it is held. */
export const PublishSaysHoldOnHover = meta.story({
  args: { label: 'Publish Edition 4', verb: 'publish' },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Publish Edition 4' });
    await userEvent.hover(trigger);
    await expect(await page.findByRole('tooltip')).toHaveTextContent('hold to publish');
    await userEvent.click(trigger);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/* Publishing becomes impossible a second into the hold, as when a collaborator's save lands mid-countdown. */
function BlockedMidHoldHarness(props: HoldActionProps) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBlocked(true), 1000);
    return () => clearTimeout(timer);
  }, []);
  return <HoldAction {...props} disabledReason={blocked ? 'Someone else saved a newer draft.' : undefined} />;
}

/** A hold running when it becomes impossible is dropped: nothing fires, and the trigger says why instead of spinning for good. */
export const BlockedMidHold = meta.story({
  args: { label: 'Publish Edition 4', verb: 'publish' },
  render: (args) => <BlockedMidHoldHarness {...args} />,
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Publish Edition 4' });
    trigger.focus();
    await userEvent.keyboard('{Enter>}');

    await waitFor(
      () => expect(page.getByRole('button', { name: 'Publish Edition 4' })).toHaveAttribute('aria-disabled', 'true'),
      { timeout: 3000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await userEvent.keyboard('{/Enter}');
  },
});

function RetryableDeletion({ onConfirm }: { onConfirm: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <Stack>
      <Menu opened withinPortal={false}>
        <Menu.Target>
          <Button variant="default">Piece</Button>
        </Menu.Target>
        <Menu.Dropdown>
          <HoldAction
            shape="menu-item"
            label="Hold to delete permanently"
            pending={pending}
            onConfirm={() => {
              setPending(true);
              onConfirm();
            }}
          />
        </Menu.Dropdown>
      </Menu>
      <Text>{pending ? 'Request pending' : 'Ready to try'}</Text>
      <Button disabled={!pending} onClick={() => setPending(false)}>
        Simulate failed request
      </Button>
    </Stack>
  );
}

/** A failed request releases a menu item's hold latch without requiring the menu to close. */
export const MenuItemRetryAfterFailure = meta.story({
  render: (args) => <RetryableDeletion onConfirm={args.onConfirm} />,
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement);
    const item = await waitForFrame(() =>
      finishTransitions(page.getByRole('menuitem', { name: 'Hold to delete permanently' }))
    );
    const clock = install({ toFake: ['setInterval', 'clearInterval'], shouldClearNativeTimers: true });
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await userEvent.pointer([{ keys: '[MouseLeft>]', target: item }]);
        await clock.tickAsync(HOLD_SECONDS * 1000);
        await waitFor(() => expect(args.onConfirm).toHaveBeenCalledTimes(attempt));
        await expect(item).toBeDisabled();
        await userEvent.pointer([{ keys: '[/MouseLeft]', target: canvasElement.ownerDocument.body }]);
        await userEvent.click(page.getByRole('button', { name: 'Simulate failed request' }));
        await waitFor(() => expect(item).toBeEnabled());
      }
    } finally {
      await userEvent.pointer([{ keys: '[/MouseLeft]', target: canvasElement.ownerDocument.body }]);
      clock.uninstall();
    }
  },
});

/** A short click leaves a menu open when its caller asks it to. */
export const MenuItemStaysOpenOnClick = meta.story({
  args: { label: 'Hold to delete permanently', shape: 'menu-item', closeMenuOnClick: false },
  render: (args) => (
    <Menu withinPortal={false}>
      <Menu.Target>
        <Button>Game menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <HoldAction {...args} />
      </Menu.Dropdown>
    </Menu>
  ),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Game menu' }));
    const item = await waitForFrame(() =>
      finishTransitions(canvas.getByRole('menuitem', { name: 'Hold to delete permanently' }))
    );
    await userEvent.click(item);
    await waitFor(() => expect(item).toBeVisible());
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});
