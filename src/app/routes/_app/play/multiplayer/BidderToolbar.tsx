import { Button, Group } from '@mantine/core';

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
      <Button variant="subtle" aria-pressed={faded} onClick={() => onFadedChange(!faded)}>
        {faded ? 'Show bidder' : 'Fade bidder'}
      </Button>
      <Button
        variant="subtle"
        disabled={!table.canInteract || !table.snapshot.bank || stage === 'idle'}
        onClick={() => client.command({ kind: 'bid-reset' })}
      >
        Reset bidder
      </Button>
    </Group>
  );
}
