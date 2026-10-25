import { Group } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { biddingPhase } from './Bidder';

type Props = {
  client: TableSession;
  table: TableProjection;
  faded: boolean;
  onFadedChange: (faded: boolean) => void;
};

/**
 * The bidder's quick controls in the top bar during Bidding (#1007).
 * Reset puts the bidder away for everyone, which brings back the row of factions to start the next round at;
 * Fade is this player's own, for seeing the board under the bidder.
 */
export function BidderToolbar({ client, table, faded, onFadedChange }: Props) {
  if (!biddingPhase(table) || !table.snapshot.roster) {
    return null;
  }
  const stage = table.snapshot.bidding?.stage ?? 'idle';
  return (
    <Group gap="xs" wrap="nowrap" role="group" aria-label="Bidder">
      <IconAction
        label={faded ? 'Show bidder' : 'Fade bidder'}
        intent="neutral"
        emphasis="quiet"
        pressed={faded}
        icon={faded ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
        onClick={() => onFadedChange(!faded)}
      />
      <IconAction
        label="Reset bidder"
        intent="neutral"
        emphasis="quiet"
        icon={<RotateCcw size={18} aria-hidden />}
        disabled={!table.canInteract || !table.snapshot.bank || stage === 'idle'}
        onClick={() => client.command({ kind: 'bid-reset' })}
      />
    </Group>
  );
}
