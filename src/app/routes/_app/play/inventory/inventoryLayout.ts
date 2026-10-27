import { createContext } from 'react';
import type { ComponentType } from 'react';

import type { SharedInventoryProps } from './useSharedInventory';

/*
 * Which layout the table's Shared table inventory window shows, while the four are compared; the shelves unless a story picks another.
 * It goes once one is chosen, and the table then shows that one alone.
 */
export const InventoryLayoutContext = createContext<ComponentType<SharedInventoryProps> | null>(null);
