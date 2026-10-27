import { IconAction } from '@ui/control/IconAction';
import { Check, Handshake, Hourglass, Unlink } from 'lucide-react';
import type { ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './AllianceRowAction.module.css';
import type { AllianceCommandKind, Relation } from './alliances';

type ActionProps = Readonly<{
  /* Why the action can't run right now, or undefined while it can. */
  blocked: string | undefined;
  send: (kind: AllianceCommandKind) => void;
}>;

const ICON = 16;

/* A waiting offer: an hourglass, pressed and breathing, which takes the offer back when clicked again. */
function Offering({ blocked, send }: ActionProps) {
  const motion = useMotionAllowed();
  return (
    <IconAction
      label="Withdraw alliance offer"
      tooltip="Offering an alliance. Click to withdraw the offer."
      icon={<Hourglass size={ICON} className={motion ? styles.pending : undefined} />}
      emphasis="standard"
      pressed
      disabledReason={blocked}
      onClick={() => send('alliance-withdraw')}
    />
  );
}

const ACTIONS: Readonly<Record<Relation, (props: ActionProps) => ReactNode>> = {
  /* The alliance is broken from the ally's row, the one faction it is with. */
  ally: ({ blocked, send }) => (
    <IconAction
      label="Break alliance"
      tooltip="End your alliance with them."
      icon={<Unlink size={ICON} />}
      intent="negative"
      emphasis="standard"
      disabledReason={blocked}
      onClick={() => send('alliance-break')}
    />
  ),
  incoming: ({ blocked, send }) => (
    <IconAction
      label="Accept alliance"
      tooltip="Accept their alliance offer."
      icon={<Check size={ICON} />}
      intent="positive"
      emphasis="standard"
      disabledReason={blocked}
      onClick={() => send('alliance-accept')}
    />
  ),
  outgoing: Offering,
  taken: () => null,
  none: ({ blocked, send }) => (
    <IconAction
      label="Offer alliance"
      tooltip="Offer them an alliance. It forms once they accept."
      icon={<Handshake size={ICON} />}
      emphasis="standard"
      disabledReason={blocked}
      onClick={() => send('alliance-offer')}
    />
  ),
};

/** What the viewer may do about one faction, as an icon with its name on hover: offer, accept, withdraw an offer, or break the alliance with their ally. */
export function AllianceRowAction({
  relation,
  disabled,
  onAction,
}: Readonly<{ relation: Relation; disabled: boolean; onAction: (kind: AllianceCommandKind) => void }>) {
  const Action = ACTIONS[relation];
  const blocked = disabled ? 'Alliances wait while the table reconnects or you step through the replay.' : undefined;
  return <Action blocked={blocked} send={onAction} />;
}
