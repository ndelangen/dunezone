import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

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
