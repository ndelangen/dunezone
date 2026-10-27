import { Button, Group, Text } from '@mantine/core';
import { MOVEMENT_PHASE_ID, nextToMove } from '@shared/play/movement';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { stormOrder } from '@shared/play/stormSector';
import { useMemo } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { actingFaction, factionName } from './tableFactions';

/** Whether the table plays Shipment and Movement now. */
function movementPhase(table: TableProjection) {
  return phaseAt(table.snapshot.phase, table.snapshot.phases ?? STANDARD_PHASES).id === MOVEMENT_PHASE_ID;
}

/**
 * Shipment and Movement in the top bar: whose turn storm order suggests next, and for a player still to go, the button that ends their turn.
 * Each faction's finished turn is a checkpoint a table review can look at.
 */
export function MovementToolbar({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const roster = table.snapshot.roster;
  const order = useMemo(
    () => stormOrder(table.state.stormSectorIndex, roster, table.state.pieces),
    [table.state.stormSectorIndex, roster, table.state.pieces]
  );
  if (!movementPhase(table) || !roster) {
    return null;
  }
  const movement = table.snapshot.movement;
  const next = nextToMove(order, movement);
  const own = actingFaction(table);
  const ownDone = own === undefined || Boolean(movement?.done.includes(own));
  return (
    <Group gap="xs" wrap="nowrap" role="group" aria-label="Shipment and Movement turns">
      <Text size="sm" role="status">
        {next ? (
          <>
            Up next: <strong>{factionName(table, next)}</strong>
          </>
        ) : (
          'Every faction has shipped and moved.'
        )}
      </Text>
      {!ownDone && (
        <Button
          size="xs"
          variant={own === next ? 'filled' : 'light'}
          disabled={!table.canInteract}
          onClick={() => own && client.command({ kind: 'movement-done', factionId: own })}
        >
          Done shipping and moving
        </Button>
      )}
    </Group>
  );
}
