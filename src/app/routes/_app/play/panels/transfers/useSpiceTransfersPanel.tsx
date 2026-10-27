import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { SpiceTransfer } from '@shared/play/spiceReserve';
import { useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { SpiceTransfersPanel } from './SpiceTransfersPanel';
import type { SpiceTransfersPanelProps } from './SpiceTransfersPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/*
 * A transfer's ends are a faction's id, the table or the Spice Bank, as the Worker's spice ledger records them (#1664).
 * The ledger stores the Spice Bank as `supply`; that literal is kept for stored data (see CONTEXT.md).
 */
function spicePlace(labels: Readonly<Partial<Record<string, string>>>, place: string): string {
  if (place === 'table') {
    return 'the table';
  }
  if (place === 'supply') {
    return 'the Spice Bank';
  }
  const name = labels[place];
  return name ? `the ${name} spice reserve` : 'the spice reserve of a faction that has left the game';
}

/* The verb each stored transfer kind reads as; `supply` and `disposal` stay as stored, and both name the Spice Bank. */
const SPICE_TRANSFER_VERBS: Readonly<Record<SpiceTransfer['kind'], string>> = {
  withdrawal: 'withdrew',
  collection: 'collected',
  supply: 'took',
  disposal: 'returned',
};

function spiceTransferText(labels: Readonly<Partial<Record<string, string>>>, transfer: SpiceTransfer): string {
  const moved = `${transfer.actor} ${SPICE_TRANSFER_VERBS[transfer.kind]} ${transfer.amount} spice`;
  if (transfer.kind === 'disposal') {
    return `${moved} to the Spice Bank.`;
  }
  return `${moved} from ${spicePlace(labels, transfer.source)} to ${spicePlace(labels, transfer.destination ?? 'table')}.`;
}

/** The transfers a table snapshot carries, as their lines read; the newest page the table hands every view. */
export function spiceTransferLines(table: TableProjection, transfers: readonly SpiceTransfer[]) {
  const labels = snapshotFactionLabels(table.snapshot);
  return transfers.map((transfer) => ({ key: transfer.revision, text: spiceTransferText(labels, transfer) }));
}

/** The Spice transfers window from the table: the page on show, read from the snapshot until an older page is asked for. */
function useSpiceTransfersPanel({ client, table }: Props): SpiceTransfersPanelProps {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.spiceHistory?.entries ?? table.snapshot.spiceTransfers ?? [];
  const last = entries.at(-1);
  return {
    transfers: spiceTransferLines(table, entries),
    hiddenHeading: Boolean(table.snapshot.stage),
    more: view.spiceHistory?.more ?? entries.length === 20,
    latest: !view.spiceHistory,
    onEarlier: () => last && client.readSpiceHistory(last.revision),
    onLatest: () => client.readSpiceHistory(),
  };
}

/** The Spice transfers window's content at a live table. */
export function ConnectedSpiceTransfersPanel(props: Props) {
  return <SpiceTransfersPanel {...useSpiceTransfersPanel(props)} />;
}
