import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { install } from './game.stories.fixture';
import { emptySpiceReserve, handAndSpiceMeta } from './panel.hand.stories.fixture';
import { openTab, settled } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

const meta = preview.meta({ ...handAndSpiceMeta, title: 'Play/Panels/Hand and spice' });

/** A Treachery card drawn into the viewer's hand sits beside the faction's leaders, each draggable back onto the table. */
export const Hand = meta.story({
  /*
   * Not captured: under Chromatic's software GL the table and the compass's way to the window outlast its 15 s capture limit.
   * The story test runner still plays it through, and CompassControls captures the window itself.
   */
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => {
    const snapshot = initialSnapshot();
    const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
    snapshot.hand!.push({ ...card, owner: 'house-harkonnen' });
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Hand');
    await expect(page.findByRole('button', { name: 'Drag Snooper from hand' })).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Drag Feyd Rautha from hand' })).toBeVisible();
  },
});

export const SpiceReserveNarrow = meta.story({
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: emptySpiceReserve,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByLabelText('Spice reserve balance')).toBeVisible());
    await expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    await expect(page.queryByRole('button', { name: 'Take into spice reserve' })).toBeNull();
  },
});
