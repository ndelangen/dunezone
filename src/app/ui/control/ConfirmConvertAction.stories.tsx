import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { ConfirmConvertAction } from './ConfirmConvertAction';

const meta = preview.meta({
  component: ConfirmConvertAction,
  parameters: { layout: 'centered' },
  args: { pending: false, onConfirm: fn() },
});
export const Default = meta.story({});
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Convert to custom card' })).toBeDisabled();
  },
});
