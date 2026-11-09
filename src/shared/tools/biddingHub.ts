import { relayOutSchema, TABLE_FRAME_LIMIT, TABLE_PHONE_LIMIT } from './biddingTable';
import type { RelayIn, TableRole } from './biddingTable';

/*
 * One IRL bidding table's routing (Norbert, 2026-11-09): the tablet and its phones meet in a BiddingTable object, which
 * passes messages between them, mostly the introductions for their direct link, and everything when the room's Wi-Fi
 * keeps them apart.
 */

/** A connected client, as the hub sees it. */
export type Member = Readonly<{ socket: Pick<WebSocket, 'send' | 'close'>; role: TableRole; id: string }>;

/** The table's routing, apart from the runtime so it can be tested. */
export class BiddingHub {
  constructor(private readonly members: () => readonly Member[]) {}

  /** Whether one more of `role` may join: one tablet at a time (a new one takes over), and up to TABLE_PHONE_LIMIT phones. */
  admits(role: TableRole, id: string) {
    return (
      role === 'tablet' ||
      this.members().filter((member) => member.role === 'phone' && member.id !== id).length < TABLE_PHONE_LIMIT
    );
  }

  /** A client joined: the one it replaces (an older tablet, or the same phone's older socket) is let go. */
  joined(joiner: Member) {
    for (const member of this.members()) {
      if (
        member.socket !== joiner.socket &&
        member.role === joiner.role &&
        (joiner.role === 'tablet' || member.id === joiner.id)
      ) {
        member.socket.close(4000, 'Replaced.');
      }
    }
    this.presence();
  }

  left() {
    this.presence();
  }

  message(sender: Member, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > TABLE_FRAME_LIMIT) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const out = relayOutSchema.safeParse(parsed);
    if (!out.success) {
      return;
    }
    const { to, data } = out.data;
    /* Phones speak only to the tablet; the tablet to one phone or all of them. */
    const targets = this.members().filter((member) =>
      sender.role === 'phone'
        ? to === 'tablet' && member.role === 'tablet'
        : member.role === 'phone' && (to === 'phones' || to === member.id)
    );
    const frame = JSON.stringify({ type: 'message', from: sender.id, data } satisfies RelayIn);
    for (const target of targets) {
      send(target, frame);
    }
  }

  private presence() {
    const members = this.members();
    const frame = JSON.stringify({
      type: 'presence',
      tablet: members.some((member) => member.role === 'tablet'),
      phones: members.filter((member) => member.role === 'phone').map((member) => member.id),
    } satisfies RelayIn);
    for (const member of members) {
      send(member, frame);
    }
  }
}

function send(member: Member, frame: string) {
  try {
    member.socket.send(frame);
  } catch {
    /* A socket closing as it is written to leaves on its own. */
  }
}
