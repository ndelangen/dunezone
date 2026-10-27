import { CataloguePicker, SpawnRequests } from './InventoryParts';
import { ShelvesInventory } from './ShelvesInventory';
import { useSharedInventory } from './useSharedInventory';
import type { SharedInventoryProps } from './useSharedInventory';

/** The Shared table inventory window's content on a live table: the inventory read from it, in the layout the window shows. */
export function SharedInventoryPanel(props: SharedInventoryProps) {
  const inventory = useSharedInventory(props);
  return (
    <ShelvesInventory
      inventory={inventory}
      picker={<CataloguePicker {...props} inventory={inventory} />}
      requests={<SpawnRequests {...props} />}
    />
  );
}
