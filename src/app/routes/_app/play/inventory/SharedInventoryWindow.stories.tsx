import preview from '@sb/preview';

import { GalleryInventory } from './GalleryInventory';
import { LedgerInventory } from './LedgerInventory';
import { inventoryWindowMeta } from './SharedInventoryWindow.stories.fixture';
import { ShelvesInventory } from './ShelvesInventory';
import { ToolbarInventory } from './ToolbarInventory';

/*
 * Four layouts of the Shared table inventory window, to pick one from: each keeps every type of piece on one row that scrolls sideways.
 * It opens on the game Worker's own table in the browser, started from the recorded journey (captured from production),
 * holding the seven Dreamrules tech tokens and a Treachery deck, so every action really happens: Draw random tech token takes one at random.
 * Hover a tech token for what it does. The live table settles at its own pace, so Chromatic takes no snapshot of it.
 */
const meta = preview.meta({
  ...inventoryWindowMeta,
  title: 'Play/Windows/Shared table inventory',
  parameters: { ...inventoryWindowMeta.parameters, playDebugger: true, chromatic: { disableSnapshot: true } },
});

/** A, Shelves: the hand window's shelves; the window's actions share one bar of equal buttons, each shelf carries its own action. */
export const Shelves = meta.story({ parameters: { inventoryLayout: ShelvesInventory } });

/** B, Ledger: one ruled line per type, its name, count and action in a column on the left, the actions in a quiet footer. */
export const Ledger = meta.story({ parameters: { inventoryLayout: LedgerInventory } });

/** C, Toolbar: every action is an icon in one bar on top; each type is a plain heading over its row of named pieces. */
export const Toolbar = meta.story({ parameters: { inventoryLayout: ToolbarInventory } });

/** D, Gallery: large named pieces; the draw is the tech token row's first tile, the actions one joined pair at the foot. */
export const Gallery = meta.story({ parameters: { inventoryLayout: GalleryInventory } });
