import { CataloguePicker, SpawnRequests } from './InventoryParts';
import { SharedInventoryPanel } from './SharedInventoryPanel';
import { useSharedInventory } from './useSharedInventory';
import type { SharedInventoryProps } from './useSharedInventory';

/** The Shared table inventory panel's content on a live table: the inventory read from it, in the layout the panel shows. */
export function ConnectedSharedInventoryPanel(props: SharedInventoryProps) {
  const inventory = useSharedInventory(props);
  return (
    <SharedInventoryPanel
      inventory={inventory}
      picker={<CataloguePicker {...props} inventory={inventory} />}
      requests={<SpawnRequests {...props} />}
    />
  );
}
