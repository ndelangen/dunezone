import { testingPreview } from '@sb/preview';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { ConfirmPublishAction } from './ConfirmPublishAction';
import type { ConfirmPublishActionProps } from './ConfirmPublishAction';

const meta = testingPreview.meta({
  title: 'ConfirmPublishAction',
  component: ConfirmPublishAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Publish Edition 4',
    pending: false,
    onConfirm: fn(),
  },
});

/* Publishing becomes impossible a second into the hold, as when a collaborator's save lands mid-countdown. */
function BlockedMidHoldHarness(props: ConfirmPublishActionProps) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBlocked(true), 1000);
    return () => clearTimeout(timer);
  }, []);
  return <ConfirmPublishAction {...props} disabledReason={blocked ? 'Someone else saved a newer draft.' : undefined} />;
}

/** A hold running when publishing becomes impossible is dropped: nothing fires, and the trigger says why instead of spinning for good. */
export const BlockedMidHold = meta.story({
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
