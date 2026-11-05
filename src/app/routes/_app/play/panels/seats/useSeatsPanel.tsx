import { seatSubject } from '@shared/play/participation';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { publicControlsOf } from '../../multiplayer/publicControls';
import { approvable, openSeats, seatLocked, seatWords } from '../../multiplayer/SeatRequests';
import { SeatsPanel } from './SeatsPanel';
import type { SeatRequestRow, SeatsPanelProps } from './SeatsPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/** How the seats stand: the players drafting, or the seats taken of the table's seats. */
function seatsLine(table: TableProjection): string {
  const seated = publicControlsOf(table).seats.length;
  if (table.snapshot.stage === 'drafting') {
    return `${seated} ${seated === 1 ? 'player is' : 'players are'} drafting`;
  }
  const total = table.snapshot.roster?.seatCount ?? seated;
  return `${seated} of ${total} seats taken`;
}

/** The open requests for a seat, each with why it cannot be approved right now, if it cannot. */
export function seatRequestRows(table: TableProjection): SeatRequestRow[] {
  const drafting = table.snapshot.stage === 'drafting';
  const open = openSeats(table);
  return publicControlsOf(table).seatRequests.map((request) => {
    /* The table keeps a request for a seat someone else took, so it can be approved if that seat opens again. */
    const taken = !drafting && request.seat !== null && !open.includes(request.seat);
    return {
      id: request.id,
      name: request.requesterName,
      asks: drafting || request.seat === null ? 'a place in the draft' : seatWords(table, request.seat),
      own: Boolean(request.own),
      ...(taken && request.seat !== null ? { closed: `${seatSubject(request.seat)} is taken now.` } : {}),
    };
  });
}

/** Whether a spectator's request waits on this viewer: a player at the live table, with a request a player could approve. */
export function seatRequestsWaiting(table: TableProjection): number {
  return approvable(table) ? seatRequestRows(table).filter((row) => !row.own && !row.closed).length : 0;
}

/** The Seats & spectators window's props from the table. */
export function seatsPanelProps(table: TableProjection, onApprove: (requestId: string) => void): SeatsPanelProps {
  const controls = publicControlsOf(table);
  return {
    seats: seatsLine(table),
    requests: seatRequestRows(table),
    spectators: controls.spectators,
    guests: controls.guests,
    approve: approvable(table)
      ? {
          disabledReason: seatLocked(table) ? 'Waiting for the table.' : undefined,
          onApprove,
        }
      : null,
  };
}

/** The Seats & spectators window's content at a live table. */
export function ConnectedSeatsPanel({ client, table }: Props) {
  return <SeatsPanel {...seatsPanelProps(table, (requestId) => client.command({ kind: 'seat-approve', requestId }))} />;
}
