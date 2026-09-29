import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ConfirmPublishAction } from './ConfirmPublishAction';

const meta = preview.meta({
  component: ConfirmPublishAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Publish Edition 4',
    pending: false,
    onConfirm: fn(),
  },
});

/** One violet glyph, the only one on the page: publishing is neither saving nor creating. Hovering says "hold to publish edition 4". */
export const Default = meta.story({});

/** A press short of the five seconds publishes nothing. The full hold shares `useHoldToConfirm` with deletion, whose unit suite pins it. */
export const ReleasedEarly = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Publish Edition 4' });

    await userEvent.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await userEvent.pointer(['[/MouseLeft]']);

    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** Nothing to publish: the trigger looks disabled but still says why on hover, and holding it does nothing. */
export const Unavailable = meta.story({
  args: { disabledReason: 'Save your changes before publishing.' },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Publish Edition 4' });
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');

    await userEvent.hover(trigger);
    await expect(
      await page.findByRole('tooltip', { name: 'Save your changes before publishing.' })
    ).toBeInTheDocument();
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});
