import { Select, Stack } from '@mantine/core';
import { TABLE_CONVERSATION, isRecallConversation } from '@shared/play/conversations';
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { ConversationView } from '../../../../../db/tabletop/ConversationSession';
import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { seatFaction } from '../../multiplayer/tableFactions';
import { ConversationPanel } from './ConversationPanel';

/* Every faction's name at the table, the viewer's own among them, by faction. */
function senderNames(context: ConversationView['context']): Record<string, string> {
  return context
    ? Object.fromEntries([
        [context.factionId, context.factionName],
        ...context.peers.map((peer) => [peer.id, peer.name]),
      ])
    : {};
}

/** A conversation at a live table: the caller selects the faction pair; this loads its history and sends what the viewer writes. */
export function ConnectedConversationPanel({ client, peerId }: Readonly<{ client: TableSession; peerId: string }>) {
  const { conversations: view } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const page = view.pages[peerId];
  useEffect(() => {
    if (view.online && !page) {
      client.conversations.load({ peerId });
    }
  }, [client, peerId, page, view.online]);
  const summary = view.summaries.find((entry) => entry.peerId === peerId);
  const latest = page?.entries.at(-1)?.sequence ?? 0;
  return (
    <ConversationPanel
      peerId={peerId}
      factionId={view.context?.factionId}
      online={view.online}
      page={page}
      pending={view.pending.filter((entry) => entry.request.peerId === peerId)}
      senders={peerId === TABLE_CONVERSATION || isRecallConversation(peerId) ? senderNames(view.context) : null}
      unread={Boolean(summary?.unread) && latest === summary?.latest}
      drafts={client.conversations.drafts}
      onLoad={(before) => client.conversations.load({ peerId, before })}
      onRead={(through) => client.conversations.read({ peerId, through })}
      onRetry={client.conversations.retry}
      onSubmit={(text) => client.conversations.submit({ peerId, text })}
    />
  );
}

/** The chat with a seat's player, or the table's, while the viewer may talk there. */
export function ConnectedPlayerChat({
  client,
  table,
  seat,
}: Readonly<{ client: TableSession; table: TableProjection; seat: string }>) {
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const peerId = seat === TABLE_CONVERSATION ? TABLE_CONVERSATION : seatFaction(table, seat);
  const context = conversations.context;
  if (!context || !peerId || (peerId !== TABLE_CONVERSATION && !context.peers.some((peer) => peer.id === peerId))) {
    return null;
  }
  return <ConnectedConversationPanel key={`${context.factionId}:${peerId}`} client={client} peerId={peerId} />;
}

/** Every conversation while the table is out of reach, one at a time. */
export function OfflineConversations({ client }: Readonly<{ client: TableSession }>) {
  const { conversations: view } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const peers = view.context ? [...view.context.peers, { id: TABLE_CONVERSATION, name: 'Table' }] : [];
  const peerId = peers.find((peer) => peer.id === selected)?.id ?? peers[0]?.id;
  if (!peerId) {
    return null;
  }
  return (
    <Stack gap="sm" w="min(36rem, 90vw)" h="70vh" style={{ overflow: 'hidden' }}>
      <Select
        label="Conversation"
        value={peerId}
        onChange={setSelected}
        data={peers.map((peer) => ({ value: peer.id, label: peer.name }))}
      />
      <ConnectedConversationPanel key={`${view.context?.factionId}:${peerId}`} client={client} peerId={peerId} />
    </Stack>
  );
}
