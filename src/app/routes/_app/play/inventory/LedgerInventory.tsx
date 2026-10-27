import { Button, Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { Layers, Plus, X } from 'lucide-react';

import { SHARED_INVENTORY_HELP } from '../multiplayer/panelGuidance';
import styles from './Inventory.module.css';
import {
  CataloguePicker,
  DRAW_ICON,
  EMPTY_INVENTORY,
  InventoryPiece,
  PieceStrip,
  SpawnRequests,
} from './InventoryParts';
import ledger from './LedgerInventory.module.css';
import { useSharedInventory } from './useSharedInventory';
import type { SharedInventoryProps } from './useSharedInventory';

/**
 * Variant B, Ledger: one line per type, ruled edge to edge as the Battle plan's rows are.
 * The type's name, count and its own action sit in a fixed column on the left, its pieces scroll in small on the right;
 * the window's actions close it in a footer of quiet buttons.
 */
export function LedgerInventory(props: SharedInventoryProps) {
  const inventory = useSharedInventory(props);
  const { catalogue, gather } = inventory;
  return (
    <Section hiddenHeading title="Shared table inventory" description={SHARED_INVENTORY_HELP}>
      <Stack gap="sm">
        <div className={ledger.rows}>
          {inventory.rows.map((row) => (
            <section key={row.key} aria-label={row.label} className={ledger.row}>
              <div className={ledger.head}>
                <Text size="sm" fw={700} lineClamp={1}>
                  {row.label}
                </Text>
                <Group gap={6} wrap="nowrap">
                  <Text size="xs" className={styles.count}>
                    {row.count}
                  </Text>
                  {row.techTokens && (
                    <IconAction
                      label="Draw random tech token"
                      tooltip={inventory.draw.help}
                      disabledReason={inventory.draw.enabled ? undefined : inventory.draw.help}
                      intent="neutral"
                      emphasis="standard"
                      size="sm"
                      icon={DRAW_ICON}
                      onClick={inventory.draw.run}
                    />
                  )}
                </Group>
              </div>
              <PieceStrip label={row.label}>
                {row.pieces.map((piece) => (
                  <InventoryPiece key={piece.id} inventory={inventory} piece={piece} size={48} />
                ))}
              </PieceStrip>
            </section>
          ))}
        </div>
        {inventory.empty && <Text c="dimmed">{EMPTY_INVENTORY}</Text>}
        <CataloguePicker {...props} inventory={inventory} />
        <SpawnRequests {...props} />
        {(catalogue || gather) && (
          <Group gap="xs" className={ledger.footer}>
            {catalogue && (
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={catalogue.open ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                disabled={!catalogue.enabled}
                onClick={catalogue.toggle}
              >
                {catalogue.open ? 'Close catalogue' : 'Add from catalogue'}
              </Button>
            )}
            {gather && (
              <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<Layers size={16} aria-hidden />}
                disabled={!gather.enabled}
                onClick={gather.run}
              >
                Gather tabletop traitors
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Section>
  );
}
