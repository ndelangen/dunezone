import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { dragTo } from '../../sortable.stories.fixture';
import { spiceReservePanelMeta } from './SpiceReservePanel.stories.fixture';

const meta = testingPreview.meta({ ...spiceReservePanelMeta, title: 'Play/Panels/Spice' });

/** Invalid amounts stay visible but cannot be dragged; a valid drop reports its amount and destination. */
export const Withdraws = meta.story({
  play: async ({ args, canvas }) => {
    const amount = canvas.getByRole('textbox', { name: 'Spice to withdraw' });
    for (const typed of ['38', '1.6']) {
      await userEvent.clear(amount);
      await userEvent.type(amount, typed);
      await expect(amount).toHaveValue(typed);
      await expect(canvas.getByRole('button', { name: /^Drag .* spice to the table$/ })).toBeDisabled();
    }
    await expect(args.onWithdraw).not.toHaveBeenCalled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '37');
    const token = canvas.getByRole('button', { name: 'Drag 37 spice to the table' });
    await userEvent.click(token);
    await expect(args.onWithdraw).not.toHaveBeenCalled();
    const box = token.getBoundingClientRect();
    const destination = { x: box.left + box.width / 2, y: box.bottom + 120 };
    await dragTo(token, destination, () => window.dispatchEvent(new FocusEvent('blur')));
    await expect(args.onWithdraw).not.toHaveBeenCalled();
    await dragTo(token, destination);
    await expect(args.onWithdraw).toHaveBeenCalledOnce();
    await expect(args.onWithdraw).toHaveBeenCalledWith(37, destination);
  },
});

/** Every valid amount remains readable on the token, including values wider than a circular badge. */
export const LargeWithdrawal = meta.story({
  args: { balance: Number.MAX_SAFE_INTEGER },
  play: async ({ canvas }) => {
    const amount = canvas.getByRole('textbox', { name: 'Spice to withdraw' });
    for (const value of [1000, Number.MAX_SAFE_INTEGER]) {
      await userEvent.clear(amount);
      await userEvent.type(amount, String(value));
      const token = canvas.getByRole('button', { name: `Drag ${value} spice to the table` });
      const label = within(token).getByText(String(value));
      await expect(token).toBeEnabled();
      await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      const bounds = label.getBoundingClientRect();
      const footprint = token.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(footprint.left);
      await expect(bounds.top).toBeGreaterThanOrEqual(footprint.top);
      await expect(bounds.right).toBeLessThanOrEqual(footprint.right);
      await expect(bounds.bottom).toBeLessThanOrEqual(footprint.bottom);
    }
  },
});
