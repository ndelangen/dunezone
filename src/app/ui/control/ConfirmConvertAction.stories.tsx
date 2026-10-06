import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ConfirmConvertAction } from './ConfirmConvertAction';

const meta = preview.meta({
  component: ConfirmConvertAction,
  parameters: { layout: 'centered' },
  args: { pending: false, onConfirm: fn() },
});
export const Default = meta.story({});
export const ReleasedEarly = meta.story({
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Convert to custom card' });
    await userEvent.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await userEvent.pointer(['[/MouseLeft]']);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});
export const Pending = meta.story({ args: { pending: true } });
