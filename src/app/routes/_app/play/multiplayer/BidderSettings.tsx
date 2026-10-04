import { NumberInput } from '@mantine/core';
import { MAX_BID_SECONDS, MIN_BID_SECONDS, idleBidding } from '@shared/play/bidding';
import { Section } from '@ui/block/Section';
import { useEffect, useState } from 'react';

import { biddingPhase } from './Bidder';
import type { TableProjection, TableSession } from './TableSession';

type Props = { client: TableSession; table: TableProjection };

/** A typed time the table accepts and does not already have, or null. */
function changedSeconds(draft: number | string, current: number) {
  const next = Number(draft);
  const valid = Number.isInteger(next) && next >= MIN_BID_SECONDS && next <= MAX_BID_SECONDS;
  return valid && next !== current ? next : null;
}

/** The time the bidder gives each faction, set beside the other phase controls. */
export function BidderSettings({ client, table }: Props) {
  const seconds = table.snapshot.bidding?.seconds ?? idleBidding().seconds;
  const [draft, setDraft] = useState<number | string>(seconds);
  useEffect(() => setDraft(seconds), [seconds]);
  if (!biddingPhase(table)) {
    return null;
  }
  return (
    <Section title="Bidder" description="The bidder passes for a faction that has not acted when its time runs out.">
      <NumberInput
        label="Seconds per bid"
        min={MIN_BID_SECONDS}
        max={MAX_BID_SECONDS}
        value={draft}
        disabled={!table.canInteract || !table.snapshot.bank}
        onChange={setDraft}
        onBlur={() => {
          const next = changedSeconds(draft, seconds);
          if (next === null) {
            setDraft(seconds);
            return;
          }
          void client.command({ kind: 'bid-seconds', seconds: next });
        }}
      />
    </Section>
  );
}
