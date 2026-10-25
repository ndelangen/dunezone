import { Button, Menu, Stack, Text } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { install } from '@sinonjs/fake-timers';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { ConfirmDeleteMenuItem } from './ConfirmDeleteMenuItem';

const meta = testingPreview.meta({
  title: 'ConfirmDeleteMenuItem',
  component: ConfirmDeleteMenuItem,
  parameters: { layout: 'centered' },
  args: { label: 'Hold to delete permanently', onConfirm: fn() },
  render: (args) => (
    <Menu opened withinPortal={false}>
      <Menu.Target>
        <Button variant="default">Piece</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item>Peek</Menu.Item>
        <ConfirmDeleteMenuItem {...args} />
      </Menu.Dropdown>
    </Menu>
  ),
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
          <ConfirmDeleteMenuItem
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

/** A failed request releases the hold latch without requiring the menu to close. */
export const RetryAfterFailure = meta.story({
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
        await clock.tickAsync(5000);
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
