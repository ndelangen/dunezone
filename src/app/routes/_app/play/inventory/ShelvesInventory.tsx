import { Button, Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { Layers, Plus, X } from 'lucide-react';

import { SHARED_INVENTORY_HELP } from '../multiplayer/panelGuidance';
import styles from './Inventory.module.css';
import {
  CataloguePicker,
  DRAW_ICON,
  DrawTechToken,
  EMPTY_INVENTORY,
  InventoryPiece,
  PieceStrip,
  SpawnRequests,
} from './InventoryParts';
import { useSharedInventory } from './useSharedInventory';
import type { SharedInventoryProps } from './useSharedInventory';

/**
 * Variant A, Shelves: the hand window's shelves, for the table.
 * The window's own actions share one bar of equal buttons on top;
 * each type then has a shelf, its name and count on the left of its caption and its own action on the right, its pieces on one scrolling row.
 */
export function ShelvesInventory(props: SharedInventoryProps) {
  const inventory = useSharedInventory(props);
  const { catalogue, gather } = inventory;
  return (
    <Section hiddenHeading title="Shared table inventory" description={SHARED_INVENTORY_HELP}>
      <Stack gap="md">
        {(catalogue || gather) && (
          <Group grow gap="xs">
            {catalogue && (
              <Button
                variant="default"
                leftSection={catalogue.open ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                disabled={!catalogue.enabled}
                onClick={catalogue.toggle}
              >
                {catalogue.open ? 'Close catalogue' : 'Add from catalogue'}
              </Button>
            )}
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
          </Group>
        )}
        <CataloguePicker {...props} inventory={inventory} />
        {inventory.rows.map((row) => (
          <section key={row.key} aria-label={row.label}>
            <Group justify="space-between" wrap="nowrap" mb={4}>
              <Text size="xs" fw={700} tt="uppercase" className={styles.rowLabel}>
                {row.label} <span className={styles.count}>{row.count}</span>
              </Text>
              {row.techTokens && (
                <DrawTechToken inventory={inventory}>
                  {(control) => (
                    <Button size="compact-sm" variant="default" leftSection={DRAW_ICON} {...control}>
                      Draw random tech token
                    </Button>
                  )}
                </DrawTechToken>
              )}
            </Group>
            <PieceStrip label={row.label}>
              {row.pieces.map((piece) => (
                <InventoryPiece key={piece.id} inventory={inventory} piece={piece} size={64} />
              ))}
            </PieceStrip>
          </section>
        ))}
        {inventory.empty && <Text c="dimmed">{EMPTY_INVENTORY}</Text>}
        <SpawnRequests {...props} />
      </Stack>
    </Section>
  );
}
