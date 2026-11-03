import { IconAction } from '@ui/control/IconAction';
import { Handshake, Hourglass, MessageCircleQuestion, Unlink } from 'lucide-react';
import type { ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './AllianceRowAction.module.css';
import type { AllianceCommandKind, Relation } from './alliances';

type ActionProps = Readonly<{
  /* Why the action can't run right now, or undefined while it can. */
  blocked: string | undefined;
  send: (kind: AllianceCommandKind) => void;
  /* The tile's size: the row's own, or the toolbar's larger tile with its 17px glyph. */
  size: ActionSize;
}>;

/** How large the action stands: `row` beside a list entry, `toolbar` among a window's toolbar actions. */
export type ActionSize = 'row' | 'toolbar';

/* The glyph for each size; the question bubble is drawn larger, so it reads on the green tile. */
const ICON = { row: 16, toolbar: 17 } as const;
const QUESTION = { row: 20, toolbar: 21 } as const;
const TILE = { row: undefined, toolbar: 'lg' } as const;

/* A waiting offer: an hourglass, pressed and breathing, which takes the offer back when clicked again. */
function Offering({ blocked, send, size }: ActionProps) {
  const motion = useMotionAllowed();
  return (
    <IconAction
      size={TILE[size]}
      label="Withdraw alliance offer"
      tooltip="Offering an alliance. Click to withdraw the offer."
      icon={<Hourglass size={ICON[size]} className={motion ? styles.pending : undefined} />}
      emphasis="standard"
      pressed
      disabledReason={blocked}
      onClick={() => send('alliance-withdraw')}
    />
  );
}

const ACTIONS: Readonly<Record<Relation, (props: ActionProps) => ReactNode>> = {
  /* The alliance is broken from the ally's row, the one faction it is with. */
  ally: ({ blocked, send, size }) => (
    <IconAction
      size={TILE[size]}
      label="Break alliance"
      tooltip="End your alliance with them."
      icon={<Unlink size={ICON[size]} />}
      intent="negative"
      emphasis="standard"
      disabledReason={blocked}
      onClick={() => send('alliance-break')}
    />
  ),
  /* A question in a speech bubble, as they are asking; a check would read as already accepted, and the window's (?) is a plain circle. Drawn larger and bolder, so the question reads on the green tile. */
  incoming: ({ blocked, send, size }) => (
    <IconAction
      size={TILE[size]}
      label="Accept alliance"
      tooltip="Accept their alliance offer."
      icon={<MessageCircleQuestion size={QUESTION[size]} strokeWidth={2.5} />}
      intent="positive"
      emphasis="standard"
      disabledReason={blocked}
      onClick={() => send('alliance-accept')}
    />
  ),
  outgoing: Offering,
  taken: () => null,
  none: ({ blocked, send, size }) => (
    <IconAction
      size={TILE[size]}
      label="Offer alliance"
      tooltip="Offer them an alliance. It forms once they accept."
      icon={<Handshake size={ICON[size]} />}
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
  size = 'row',
}: Readonly<{
  relation: Relation;
  disabled: boolean;
  onAction: (kind: AllianceCommandKind) => void;
  size?: ActionSize;
}>) {
  const Action = ACTIONS[relation];
  const blocked = disabled ? 'Alliances wait while the table reconnects or you step through the replay.' : undefined;
  return <Action blocked={blocked} send={onAction} size={size} />;
}
