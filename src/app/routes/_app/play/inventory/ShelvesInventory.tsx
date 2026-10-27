import { Button, Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { Layers, Plus } from 'lucide-react';

import { SHARED_INVENTORY_HELP } from '../multiplayer/panelGuidance';
import styles from './Inventory.module.css';
import { DRAW_ICON, DrawTechToken, InventoryPiece, PieceStrip } from './InventoryParts';
import type { InventoryRow } from './inventoryRows';
import type { SharedInventory, SharedInventoryViewProps } from './useSharedInventory';

/* A shelf's own +, which opens the catalogue on that shelf's type alone; it is off during setup, when nothing can be added. */
function AddToShelf({ inventory, row }: Readonly<{ inventory: SharedInventory; row: InventoryRow }>) {
  const catalogue = inventory.catalogue;
  if (!catalogue || !row.spawnType) {
    return null;
  }
  const open = catalogue.shelf === row.key;
  const label = open
    ? `Close the ${row.label.toLowerCase()} catalogue`
    : `Add ${row.label.toLowerCase()} from the catalogue`;
  return (
    <IconAction
      label={label}
      tooltip={row.holdsPieces ? undefined : `${label}. A bundle's tokens land on their own shelves.`}
      intent="neutral"
      emphasis="quiet"
      size="sm"
      pressed={open}
      icon={<Plus size={16} aria-hidden />}
      disabledReason={catalogue.enabled ? undefined : 'Only a seated player can add to the table.'}
      onClick={() => catalogue.toggleShelf(row)}
    />
  );
}

/**
 * The Shared table inventory, as shelves: one for every type the catalogue can add, its name and count on the left of its caption and its own + on the right, which opens the catalogue on that type alone;
 * its pieces sit on one row that scrolls sideways, and a line divides it from the next.
 * The shelves holding pieces come first.
 * An empty one shows only its caption.
 * The Bundles shelf only adds, since a bundle's tokens land on their own shelves.
 * Its + says so.
 * The tech token shelf also draws one of its tokens at random.
 */
export function ShelvesInventory({ inventory, picker, requests }: SharedInventoryViewProps) {
  const { catalogue, gather } = inventory;
  return (
    <Section hiddenHeading title="Shared table inventory" description={SHARED_INVENTORY_HELP}>
      <Stack gap="md">
        {gather && (
          <Button
            variant="default"
            leftSection={<Layers size={16} aria-hidden />}
            disabled={!gather.enabled}
            onClick={gather.run}
          >
            Gather tabletop traitors
          </Button>
        )}
        {inventory.rows.map((row) => (
          <section key={row.key} aria-label={row.label} className={styles.shelf}>
            <Group justify="space-between" wrap="nowrap" mb={4}>
              <Text size="xs" fw={700} tt="uppercase" className={styles.rowLabel}>
                {row.label} {row.holdsPieces && <span className={styles.count}>{row.count}</span>}
              </Text>
              <Group gap="xs" wrap="nowrap">
                {row.spawnType === 'token-tech' && (
                  <DrawTechToken inventory={inventory}>
                    {(control) => (
                      <Button size="compact-sm" variant="default" leftSection={DRAW_ICON} {...control}>
                        Draw random tech token
                      </Button>
                    )}
                  </DrawTechToken>
                )}
                <AddToShelf inventory={inventory} row={row} />
              </Group>
            </Group>
            {catalogue?.shelf === row.key && picker}
            {row.pieces.length > 0 && (
              <PieceStrip label={row.label}>
                {row.pieces.map((piece) => (
                  <InventoryPiece key={piece.id} inventory={inventory} piece={piece} size={64} />
                ))}
              </PieceStrip>
            )}
          </section>
        ))}
        {requests}
      </Stack>
    </Section>
  );
}
