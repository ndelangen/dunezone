import { Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { Layers, Plus, X } from 'lucide-react';

import { SHARED_INVENTORY_HELP } from '../multiplayer/panelGuidance';
import styles from './Inventory.module.css';
import { DRAW_ICON, EMPTY_INVENTORY, InventoryPiece, PieceStrip } from './InventoryParts';
import type { InventoryLayoutProps } from './useSharedInventory';

/**
 * Variant C, Toolbar: every action is one icon in a slim bar on top, beside how much the inventory holds, each named by its tooltip.
 * Below it each type has a plain heading and one scrolling row of pieces with their names underneath.
 */
export function ToolbarInventory({ inventory, picker, requests }: InventoryLayoutProps) {
  const { catalogue, gather } = inventory;
  const total = inventory.rows.reduce((count, row) => count + row.count, 0);
  const tech = inventory.rows.some((row) => row.techTokens);
  return (
    <Section hiddenHeading title="Shared table inventory" description={SHARED_INVENTORY_HELP}>
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" className={styles.rowLabel}>
            {total} {total === 1 ? 'piece' : 'pieces'} for everyone
          </Text>
          <Group gap={6} wrap="nowrap" role="toolbar" aria-label="Shared table inventory actions">
            {tech && (
              <IconAction
                label="Draw random tech token"
                tooltip={inventory.draw.help}
                disabledReason={inventory.draw.enabled ? undefined : inventory.draw.help}
                intent="neutral"
                emphasis="standard"
                icon={DRAW_ICON}
                onClick={inventory.draw.run}
              />
            )}
            {gather && (
              <IconAction
                label="Gather tabletop traitors"
                intent="neutral"
                emphasis="standard"
                icon={<Layers size={16} aria-hidden />}
                disabled={!gather.enabled}
                onClick={gather.run}
              />
            )}
            {catalogue && (
              <IconAction
                label={catalogue.open ? 'Close catalogue' : 'Add from catalogue'}
                intent="neutral"
                emphasis="standard"
                pressed={catalogue.open}
                icon={catalogue.open ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                disabled={!catalogue.enabled}
                onClick={catalogue.toggle}
              />
            )}
          </Group>
        </Group>
        {picker}
        {inventory.rows.map((row) => (
          <section key={row.key} aria-label={row.label}>
            <Text size="sm" fw={700} mb={4}>
              {row.label} <span className={styles.count}>{row.count}</span>
            </Text>
            <PieceStrip label={row.label}>
              {row.pieces.map((piece) => (
                <InventoryPiece key={piece.id} inventory={inventory} piece={piece} size={56} caption />
              ))}
            </PieceStrip>
          </section>
        ))}
        {inventory.empty && <Text c="dimmed">{EMPTY_INVENTORY}</Text>}
        {requests}
      </Stack>
    </Section>
  );
}
