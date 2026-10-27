import { Button, Stack, Text, UnstyledButton } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { Layers, Plus, X } from 'lucide-react';
import { Dices } from 'lucide-react';

import { SHARED_INVENTORY_HELP } from '../multiplayer/panelGuidance';
import gallery from './GalleryInventory.module.css';
import styles from './Inventory.module.css';
import {
  CataloguePicker,
  DrawTechToken,
  EMPTY_INVENTORY,
  InventoryPiece,
  PieceStrip,
  SpawnRequests,
} from './InventoryParts';
import { useSharedInventory } from './useSharedInventory';
import type { SharedInventoryProps } from './useSharedInventory';

/**
 * Variant D, Gallery: large pieces with their names, one scrolling row per type.
 * The random draw is the tech token row's first tile, a face-down token to pick from, so the action sits where its pieces are;
 * the window's own actions close it as one joined pair of equal buttons.
 */
export function GalleryInventory(props: SharedInventoryProps) {
  const inventory = useSharedInventory(props);
  const { catalogue, gather } = inventory;
  return (
    <Section hiddenHeading title="Shared table inventory" description={SHARED_INVENTORY_HELP}>
      <Stack gap="md">
        {inventory.rows.map((row) => (
          <section key={row.key} aria-label={row.label}>
            <Text size="xs" fw={700} tt="uppercase" className={styles.rowLabel} mb={4}>
              {row.label} <span className={styles.count}>{row.count}</span>
            </Text>
            <PieceStrip label={row.label}>
              {row.techTokens && (
                <DrawTechToken inventory={inventory}>
                  {(control) => (
                    <UnstyledButton className={gallery.draw} aria-label="Draw random tech token" {...control}>
                      <Dices size={28} aria-hidden />
                      <Text size="xs" fw={700}>
                        Draw at random
                      </Text>
                    </UnstyledButton>
                  )}
                </DrawTechToken>
              )}
              {row.pieces.map((piece) => (
                <InventoryPiece key={piece.id} inventory={inventory} piece={piece} size={80} caption />
              ))}
            </PieceStrip>
          </section>
        ))}
        {inventory.empty && <Text c="dimmed">{EMPTY_INVENTORY}</Text>}
        <CataloguePicker {...props} inventory={inventory} />
        <SpawnRequests {...props} />
        {(catalogue || gather) && (
          <Button.Group className={gallery.actions}>
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
          </Button.Group>
        )}
      </Stack>
    </Section>
  );
}
