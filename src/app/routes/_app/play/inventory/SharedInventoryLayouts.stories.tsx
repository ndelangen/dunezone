import preview from '@sb/preview';

import { GalleryInventory } from './GalleryInventory';
import { LedgerInventory } from './LedgerInventory';
import { inventoryArgs, inWindow } from './SharedInventoryLayouts.stories.fixture';
import { ShelvesInventory } from './ShelvesInventory';
import { ToolbarInventory } from './ToolbarInventory';

/*
 * Four layouts of the Shared table inventory window's content, to pick one from, each shown alone in a window's frame.
 * Every type of piece keeps to one row that scrolls sideways; hover a tech token for what it does.
 */
const meta = preview.meta({
  title: 'Play/Panels/Shared table inventory layouts',
  component: ShelvesInventory,
  decorators: [inWindow],
  globals: { motion: 'on' },
  args: inventoryArgs(),
});

/** A, Shelves: the hand window's shelves; the window's actions share one bar of equal buttons, each shelf carries its own action. */
export const Shelves = meta.story({});

/** B, Ledger: one ruled line per type, its name, count and action in a column on the left, the actions in a quiet footer. */
export const Ledger = meta.story({ render: (args) => <LedgerInventory {...args} /> });

/** C, Toolbar: every action is an icon in one bar on top; each type is a plain heading over its row of named pieces. */
export const Toolbar = meta.story({ render: (args) => <ToolbarInventory {...args} /> });

/** D, Gallery: large named pieces; the draw is the tech token row's first tile, the actions one joined pair at the foot. */
export const Gallery = meta.story({ render: (args) => <GalleryInventory {...args} /> });
