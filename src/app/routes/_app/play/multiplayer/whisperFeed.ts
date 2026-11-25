import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { useCallback, useEffect, useRef } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { CompassTable } from '../compass/compassTable';

/**
 * The whisper notices the table hears as they arrive, by seat: in a game that announces private messages, each one says that the player of one seat wrote to the player of another (playtest feedback, 2026-11-25).
 * The seats are read when a notice arrives, so a trade of seats meanwhile names the seats as they are then.
 */
export function useWhisperFeed(client: TableSession, table: TableProjection): CompassTable['whispers'] {
  const roster = useRef(table.snapshot.roster);
  useEffect(() => {
    roster.current = table.snapshot.roster;
  });
  return useCallback<NonNullable<CompassTable['whispers']>>(
    (listener) =>
      client.conversations.subscribeMessages((peerId, message) => {
        if (peerId !== TABLE_CONVERSATION || !message.whisperTo) {
          return;
        }
        const seatOf = (factionId: string) => roster.current?.seats.find((seat) => seat.faction?.id === factionId)?.id;
        const from = seatOf(message.senderFactionId);
        const to = seatOf(message.whisperTo);
        if (from && to) {
          listener({ key: message.sequence, from, to });
        }
      }),
    [client]
  );
}
