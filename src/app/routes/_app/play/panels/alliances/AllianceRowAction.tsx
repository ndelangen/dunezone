import { Button, Text, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';

import type { AllianceCommandKind, Relation } from './alliances';

type ActionProps = Readonly<{ disabled: boolean; send: (kind: AllianceCommandKind) => void }>;

const ACTIONS: Readonly<Record<Relation, (props: ActionProps) => ReactNode>> = {
  'own-allied': ({ disabled, send }) => (
    <Button size="xs" variant="default" disabled={disabled} onClick={() => send('alliance-break')}>
      Break alliance
    </Button>
  ),
  own: () => (
    <Text size="sm" c="dimmed">
      Your faction
    </Text>
  ),
  ally: () => (
    <Text size="sm" c="dimmed">
      Your ally
    </Text>
  ),
  incoming: ({ disabled, send }) => (
    <Button size="xs" disabled={disabled} onClick={() => send('alliance-accept')}>
      Accept
    </Button>
  ),
  /* The offer waits until it is accepted; clicking it again takes it back. */
  outgoing: ({ disabled, send }) => (
    <Tooltip label="Your offer is waiting. Click to withdraw it." withinPortal>
      <Button size="xs" variant="default" disabled={disabled} onClick={() => send('alliance-withdraw')}>
        Offering…
      </Button>
    </Tooltip>
  ),
  taken: () => null,
  none: ({ disabled, send }) => (
    <Button size="xs" variant="default" disabled={disabled} onClick={() => send('alliance-offer')}>
      Offer alliance
    </Button>
  ),
};

/** What the viewer may do about one faction: offer, accept, withdraw an offer, or break their own alliance. */
export function AllianceRowAction({
  relation,
  disabled,
  onAction,
}: Readonly<{ relation: Relation; disabled: boolean; onAction: (kind: AllianceCommandKind) => void }>) {
  const Action = ACTIONS[relation];
  return <Action disabled={disabled} send={onAction} />;
}
