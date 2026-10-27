import preview from '@sb/preview';

import { SharedInventoryPanel } from './SharedInventoryPanel';
import { inventoryArgs, inWindow } from './SharedInventoryPanel.stories.fixture';

/*
 * The Shared table inventory window's content alone, in a window's frame: a shelf for every type the catalogue can add,
 * each with its own +, its pieces on one row that scrolls sideways. Hover a tech token for what it does.
 */
const meta = preview.meta({
  title: 'Play/Panels/Shared table inventory',
  component: SharedInventoryPanel,
  decorators: [inWindow],
  globals: { motion: 'on' },
  args: inventoryArgs(),
});

/** A Treachery deck, faction tokens and the seven Dreamrules tech tokens; the other shelves are empty. */
export const Shelves = meta.story({});
