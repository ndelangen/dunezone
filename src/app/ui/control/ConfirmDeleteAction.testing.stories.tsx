import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ConfirmDeleteAction } from './ConfirmDeleteAction';

/* How a loading glyph looks is IconAction's own story; this checks that the trigger turns it on (ADR-0005). */
const meta = testingPreview.meta({
  title: 'ConfirmDeleteAction',
  component: ConfirmDeleteAction,
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
