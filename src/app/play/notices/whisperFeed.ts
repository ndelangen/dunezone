import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { useEffect, useRef, useState } from 'react';

import type { TableProjection, TableSession } from '../../db/tabletop/TableSession';
import type { CompassTable, Whisper } from '../compass/compassTable';
import { bufferedSource } from './noticeFeed';

/**
 * The whisper notices the table hears as they arrive, by seat: in a game that announces private messages, each one says that the player of one seat wrote to the player of another (playtest feedback, 2026-11-25).
 * The seats are read when a notice arrives, so a trade of seats meanwhile names the seats as they are then.
 * Notices are heard from when the table shows, and kept a moment until the bar's lazily loaded threads listen, so none arriving meanwhile is lost.
 */
export function useWhisperFeed(client: TableSession, table: TableProjection): CompassTable['whispers'] {
  const announced = table.snapshot.announceWhispers === true;
  const roster = useRef(table.snapshot.roster);
  useEffect(() => {
    roster.current = table.snapshot.roster;
  });
  const [source] = useState(() => bufferedSource<[Whisper]>());
  useEffect(() => {
    if (!announced) {
      return;
    }
    const stop = client.conversations.subscribeMessages((peerId, message) => {
      if (peerId !== TABLE_CONVERSATION || !message.whisperTo) {
        return;
      }
      const seatOf = (factionId: string) => roster.current?.seats.find((seat) => seat.faction?.id === factionId)?.id;
      const from = seatOf(message.senderFactionId);
      const to = seatOf(message.whisperTo);
      if (from && to) {
        source.push({ key: message.sequence, from, to });
      }
    });
    return () => {
      stop();
    };
  }, [client, source, announced]);
  /* A game that does not announce private messages has no notices to hear, and the bar loads nothing for them. */
  return announced ? source.subscribe : undefined;
}
