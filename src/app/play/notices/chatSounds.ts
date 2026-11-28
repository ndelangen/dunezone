import { alliesOf } from '@shared/play/alliances';
import { TABLE_CONVERSATION, isRecallConversation } from '@shared/play/conversations';
import type { ConversationSummary } from '@shared/play/conversations';
import { rosterSeat } from '@shared/play/schema';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { playTableSound } from '@app/widgets/tabletop/tableSounds';
import type { TableSound } from '@app/widgets/tabletop/tableSounds';

import type { TableProjection, TableSession } from '../../db/tabletop/TableSession';
import { isViewingConversation } from '../panels/chat/viewingConversations';

/* Which sound a new message in one conversation makes: the table's chat (and a recall's), your ally, or another faction. */
function chatSound(peerId: string, allies: readonly string[]): TableSound {
  if (peerId === TABLE_CONVERSATION || isRecallConversation(peerId)) {
    return 'chat-table';
  }
  return allies.includes(peerId) ? 'chat-ally' : 'chat-other';
}

/* The more personal sound wins when several conversations gain a message at once. */
const RANK: Readonly<Partial<Record<TableSound, number>>> = { 'chat-table': 0, 'chat-other': 1, 'chat-ally': 2 };

/**
 * The sound for the conversations whose unread count rose since the last summaries, or null.
 * A conversation not seen before counts only when earlier summaries were there, so the counts a (re)connection brings stay silent.
 * A conversation a chat panel shows makes none, as its message is already in view.
 */
export function newMessageSound(
  previous: readonly ConversationSummary[] | null,
  next: readonly ConversationSummary[],
  allies: readonly string[],
  inView: (peerId: string) => boolean = () => false
): TableSound | null {
  if (!previous || previous.length === 0) {
    return null;
  }
  const before = new Map(previous.map((entry) => [entry.peerId, entry.unread]));
  let sound: TableSound | null = null;
  for (const { peerId, unread } of next) {
    if (unread > (before.get(peerId) ?? 0) && !inView(peerId)) {
      const candidate = chatSound(peerId, allies);
      sound = sound && (RANK[sound] ?? 0) >= (RANK[candidate] ?? 0) ? sound : candidate;
    }
  }
  return sound;
}

/* A message arrives now, so it is sorted by the alliances now, not those of a past turn the viewer is looking at. */
function liveAllies(client: TableSession, table: TableProjection) {
  const live = table.playback || table.historyPending ? (client.getLastLiveTable() ?? table) : table;
  const seat = live.viewer.viewerSeat;
  const own = seat ? rosterSeat(live.snapshot.roster, seat)?.faction?.id : undefined;
  return own ? alliesOf(live.snapshot.alliances, own) : [];
}

/** Plays a soft sound when a chat message arrives, one per conversation kind (Norbert, 2026-11-17, #2982). */
export function useChatSounds(client: TableSession, table: TableProjection) {
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const allies = liveAllies(client, table);
  const previous = useRef<readonly ConversationSummary[] | null>(null);
  const summaries = conversations.summaries;
  const alliesKey = allies.join(',');
  useEffect(() => {
    const sound = newMessageSound(
      previous.current,
      summaries,
      alliesKey ? alliesKey.split(',') : [],
      isViewingConversation
    );
    previous.current = summaries;
    if (sound) {
      playTableSound(sound);
    }
  }, [summaries, alliesKey]);
}
