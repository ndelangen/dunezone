import type { SpawnType } from '@shared/play/captureTypes';
import type { SpawnSelection } from '@shared/play/inventory';
import type { TablePiece } from '@shared/play/model';
import { drawableTechTokens } from '@shared/play/techToken';
import { useReducer } from 'react';
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import { inventoryRows } from './inventoryRows';
import type { InventoryRow } from './inventoryRows';

export type SharedInventoryProps = Readonly<{ client: TableSession; table: TableProjection }>;

/* The catalogue picker, open on one shelf's own type, and the asset chosen in it. */
type PickerState = Readonly<{
  open: boolean;
  shelf: string | null;
  types: readonly SpawnType[];
  selection: SpawnSelection | null;
  requestId: string | null;
}>;
type PickerEvent =
  | { type: 'open'; shelf: string | null; types: readonly SpawnType[] }
  | { type: 'close' }
  | { type: 'select'; selection: SpawnSelection; requestId: string };

const CLOSED: PickerState = { open: false, shelf: null, types: [], selection: null, requestId: null };

function pickerReducer(state: PickerState, event: PickerEvent): PickerState {
  if (event.type === 'select') {
    return { ...state, open: true, selection: event.selection, requestId: event.requestId };
  }
  return event.type === 'open'
    ? { open: true, shelf: event.shelf, types: event.types, selection: null, requestId: null }
    : CLOSED;
}

/** What the random tech token draw says it does, or why it is off. */
export function drawHelp(left: number) {
  return left
    ? `Picks one of the ${left} tech ${left === 1 ? 'token' : 'tokens'} left here at random and sets it down face up in front of you on the table.`
    : 'No tech tokens are left in the shared table inventory.';
}

/** The shared table inventory read from the table: its shelves, what a player may do with each piece, and its actions. */
export function useSharedInventory({ client, table }: SharedInventoryProps) {
  const pointerSession = usePointerSession();
  const [picker, dispatch] = useReducer(pickerReducer, CLOSED);
  const pieces = table.snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  /* A token another player is carrying out is not there to draw, though the snapshot still lists it. */
  const techLeft = drawableTechTokens(pieces)
    .filter((piece) => !table.reservedPieceIds.has(piece.id))
    .reduce((count, piece) => count + piece.items.length, 0);
  const canHandle = table.canHandleTable;
  const rows = inventoryRows(pieces);
  return {
    rows,
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
      help: drawHelp(techLeft),
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
            /** The shelf whose catalogue is open, if any. */
            shelf: picker.open ? picker.shelf : null,
            /** Opens the catalogue on one shelf's own types, or closes it when that shelf's is already open. */
            toggleShelf: (row: InventoryRow) =>
              dispatch(
                picker.open && picker.shelf === row.key
                  ? { type: 'close' }
                  : { type: 'open', shelf: row.key, types: row.spawnType ? [row.spawnType] : [] }
              ),
            picker,
            select: (selection: SpawnSelection) =>
              dispatch({ type: 'select', selection, requestId: client.catalogue(selection) }),
          },
  };
}

export type SharedInventory = ReturnType<typeof useSharedInventory>;

/** What the inventory's view gets: the inventory, and the catalogue picker and spawn requests, which talk to the table themselves. */
export type SharedInventoryViewProps = Readonly<{ inventory: SharedInventory; picker: ReactNode; requests: ReactNode }>;
