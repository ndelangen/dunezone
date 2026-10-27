import { testingPreview } from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { ConfirmConvertAction } from './ConfirmConvertAction';

/* How a loading glyph looks is IconAction's own story; this checks that the trigger turns it on (ADR-0005). */
const meta = testingPreview.meta({
  title: 'ConfirmConvertAction',
  component: ConfirmConvertAction,
  parameters: { layout: 'centered' },
  args: { pending: false, onConfirm: fn() },
});

/** While the conversion is in flight the trigger latches, so an impatient second hold cannot fire it twice. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Convert to custom card' })).toBeDisabled();
  },
});
