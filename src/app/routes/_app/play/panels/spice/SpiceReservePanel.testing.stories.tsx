import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { spiceReservePanelMeta } from './SpiceReservePanel.stories.fixture';

const meta = testingPreview.meta({ ...spiceReservePanelMeta, title: 'Play/Panels/Spice' });

/** An amount past the balance, or a fraction, stays as typed and withdraws nothing; the whole balance withdraws. */
export const Withdraws = meta.story({
  play: async ({ args, canvas }) => {
    const amount = canvas.getByRole('textbox', { name: 'Spice to withdraw' });
    const withdraw = canvas.getByRole('button', { name: 'Withdraw spice' });
    for (const typed of ['38', '1.6']) {
      await userEvent.clear(amount);
      await userEvent.type(amount, typed);
      await userEvent.click(withdraw);
      await expect(amount).toHaveValue(typed);
    }
    await expect(args.onWithdraw).not.toHaveBeenCalled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '37');
    await userEvent.click(withdraw);
    await expect(args.onWithdraw).toHaveBeenCalledOnce();
    await expect(args.onWithdraw).toHaveBeenCalledWith(37);
  },
});
