import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { requestSnapshot, seatsPanelMeta, seatsProps } from './SeatsPanel.stories.fixture';

const meta = testingPreview.meta({ ...seatsPanelMeta, title: 'Play/Panels/Seats & spectators' });

/** Approve sends the approval of that request. */
export const ApprovesTheRequest = meta.story({
  args: seatsProps(requestSnapshot()),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Approve IHasPinecone' }));
    await expect(args.approve?.onApprove).toHaveBeenCalledWith('seat-request-1');
  },
});
