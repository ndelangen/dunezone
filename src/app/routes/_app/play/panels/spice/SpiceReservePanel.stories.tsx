import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { spiceReservePanelMeta } from './SpiceReservePanel.stories.fixture';

/* The Spice window on its own: the faction's private reserve, and an amount to withdraw onto the table. */
const meta = preview.meta({ ...spiceReservePanelMeta, title: 'Play/Panels/Spice' });

/** A reserve of 37 spice, ready to withdraw one. */
export const Reserve = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Spice reserve balance')).toHaveTextContent('37');
  },
});

/** An empty reserve: nothing to withdraw, and the window's (?) says how spice comes and goes. */
export const Empty = meta.story({
  args: { balance: 0 },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('img', { name: 'Help' })).toHaveAccessibleDescription(
      /Drop a stack on the Spice Bank disc/
    );
  },
});
