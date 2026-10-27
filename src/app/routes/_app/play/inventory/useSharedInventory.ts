import type { SpawnSelection } from '@shared/play/inventory';
import type { TablePiece } from '@shared/play/model';
import { drawableTechTokens, isTechToken } from '@shared/play/techToken';
import { useReducer } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import { inventoryRows } from './inventoryRows';

export type SharedInventoryProps = Readonly<{ client: TableSession; table: TableProjection }>;

type PickerState = Readonly<{ open: boolean; selection: SpawnSelection | null; requestId: string | null }>;
type PickerEvent = { type: 'open' | 'close' } | { type: 'select'; selection: SpawnSelection; requestId: string };

function pickerReducer(_state: PickerState, event: PickerEvent): PickerState {
  if (event.type === 'select') {
    return { open: true, selection: event.selection, requestId: event.requestId };
  }
  return { open: event.type === 'open', selection: null, requestId: null };
}

/**
 * What every layout of the shared table inventory works from: its rows, what a player may do with each piece, and its actions.
 * The layouts differ only in where they put these.
 */
export function useSharedInventory({ client, table }: SharedInventoryProps) {
  const pointerSession = usePointerSession();
  const [picker, dispatch] = useReducer(pickerReducer, { open: false, selection: null, requestId: null });
  const pieces = table.snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  /* A token another player is carrying out is not there to draw, though the snapshot still lists it. */
  const techLeft = drawableTechTokens(pieces)
    .filter((piece) => !table.reservedPieceIds.has(piece.id))
    .reduce((count, piece) => count + piece.items.length, 0);
  const canHandle = table.canHandleTable;
  const rows = inventoryRows(pieces, table.snapshot.table.pieces.some(isTechToken));
  return {
    rows,
    empty: !rows.length,
    /** Whether this piece can be dragged out now: nobody else is carrying it and the viewer may handle the table. */
    movable: (piece: TablePiece) => canHandle && !table.reservedPieceIds.has(piece.id),
    /** Picks the piece up under the pointer; Shift takes only its top item. */
    carry: (event: ReactPointerEvent<HTMLElement>, piece: TablePiece) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      pointerSession.carry(event.nativeEvent, piece.id, event.shiftKey ? 'top' : 'whole');
    },
    draw: {
      left: techLeft,
      enabled: canHandle && techLeft > 0,
      help: techLeft
        ? `Picks one of the ${techLeft} tech ${techLeft === 1 ? 'token' : 'tokens'} left here at random and sets it down face up in front of you on the table.`
        : 'No tech tokens are left in the shared table inventory.',
      run: () => client.command({ kind: 'tech-token-draw' }),
    },
    /* Setup gathers the Traitor cards left on the table; the catalogue opens once play starts. */
    gather: table.snapshot.setup
      ? { enabled: canHandle, run: () => client.command({ kind: 'traitors-gather' }) }
      : null,
    catalogue:
      table.snapshot.stage === 'setup'
        ? null
        : {
            enabled: canHandle,
            open: picker.open,
            toggle: () => dispatch({ type: picker.open ? 'close' : 'open' }),
            picker,
            select: (selection: SpawnSelection) =>
              dispatch({ type: 'select', selection, requestId: client.catalogue(selection) }),
          },
  };
}

export type SharedInventory = ReturnType<typeof useSharedInventory>;
