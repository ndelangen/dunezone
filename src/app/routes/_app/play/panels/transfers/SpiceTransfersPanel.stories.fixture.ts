import type { GameSnapshot } from '@shared/play/protocol';
import { fn } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { SpiceTransfersPanel } from './SpiceTransfersPanel';
import type { SpiceTransfersPanelProps } from './SpiceTransfersPanel';
import { spiceTransferLines } from './useSpiceTransfersPanel';

/* Every kind of transfer, newest first: a return to the Spice Bank, a collection by a faction gone from the roster, a take from the bank, and a withdrawal. */
export function transfersSnapshot(): GameSnapshot {
  const snapshot = playingSnapshot();
  const faction = snapshot.roster!.seats[1]!.faction!;
  return {
    ...snapshot,
    bank: { factionId: faction.id, balance: 4 },
    spiceTransfers: [
      { revision: 4, actor: 'Thialfi', kind: 'disposal', amount: 1, source: 'table' },
      { revision: 3, actor: 'Thialfi', kind: 'collection', amount: 3, source: 'table', destination: 'gone-faction' },
      { revision: 2, actor: 'Twaffle', kind: 'supply', amount: 6, source: 'supply', destination: 'table' },
      { revision: 1, actor: 'Thialfi', kind: 'withdrawal', amount: 2, source: faction.id, destination: 'table' },
    ],
  };
}

/** The panel's props as the table hands them for this snapshot's transfers, the newest page with nothing older. */
export function transfersProps(snapshot: GameSnapshot = transfersSnapshot()): SpiceTransfersPanelProps {
  return {
    transfers: spiceTransferLines(tableOf(snapshot), snapshot.spiceTransfers ?? []),
    hiddenHeading: true,
    more: false,
    latest: true,
    onEarlier: fn(),
    onLatest: fn(),
  };
}

export const transfersPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.transfers),
  component: SpiceTransfersPanel,
  args: transfersProps(),
};
