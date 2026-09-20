import { Badge, Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import type { ConversationMessage } from '@shared/play/conversations';
import { Section } from '@ui/block/Section';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { TableSession } from './TableSession';

const EMPTY_MESSAGES: ConversationMessage[] = [];

/** The caller selects the faction pair; this panel owns composing and observing the visible newest message. */
export function Conversation({ client, peerId }: Readonly<{ client: TableSession; peerId: string }>) {
  const { conversations: view } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [draft, setDraft] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const newest = useRef<HTMLDivElement>(null);
  const scroll = useRef({ bottom: true, height: 0, first: 0, last: 0 });
  const page = view.pages[peerId];
  const entries = page?.entries ?? EMPTY_MESSAGES;
  const latest = entries.at(-1)?.sequence ?? 0;
  const summary = view.summaries.find((entry) => entry.peerId === peerId);
  const pending = view.pending.filter((entry) => entry.request.peerId === peerId);
  useEffect(() => {
    if (view.online && !page) {
      client.conversations.load(peerId);
    }
  }, [client, peerId, page, view.online]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) {
      return;
    }
    const previous = scroll.current;
    const first = entries[0]?.sequence ?? 0;
    if (first && previous.first && first < previous.first) {
      element.scrollTop += element.scrollHeight - previous.height;
    } else if (previous.bottom) {
      element.scrollTop = element.scrollHeight;
    }
    scroll.current = {
      bottom: element.scrollHeight - element.scrollTop - element.clientHeight < 8,
      first,
      last: latest,
      height: element.scrollHeight,
    };
  }, [entries, latest, pending.length]);
  useEffect(() => {
    const target = newest.current;
    if (!target || !view.online || !summary?.unread || latest !== summary.latest) {
      return;
    }
    let visible = false;
    const read = () => {
      if (visible && document.visibilityState === 'visible') {
        client.conversations.read(peerId, latest);
      }
    };
    /* A viewport-root observer accounts for both the scrollback and the surrounding dock being off-screen. */
    const observer = new IntersectionObserver(
      ([entry]) => {
        /* Fractional scroll rounding can clip part of this one-pixel end marker. */
        visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0);
        read();
      },
      { threshold: 0 }
    );
    observer.observe(target);
    document.addEventListener('visibilitychange', read);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', read);
    };
  }, [client, peerId, latest, summary?.latest, summary?.unread, view.online]);
  return (
    <Section title="Conversation">
      <Stack gap="sm">
        {!view.online && (
          <Text size="sm">Offline. Pending messages will send after your faction access is checked.</Text>
        )}
        <Stack
          ref={viewport}
          gap="sm"
          mah="40vh"
          style={{ overflowY: 'auto', overflowAnchor: 'none' }}
          role="region"
          aria-label="Conversation history"
          tabIndex={0}
          onScroll={() => {
            const element = viewport.current!;
            scroll.current.bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 8;
          }}
        >
          {page?.more && (
            <Button
              variant="subtle"
              loading={Boolean(page.loading)}
              onClick={() => client.conversations.load(peerId, entries[0]!.sequence)}
            >
              Earlier messages
            </Button>
          )}
          {page?.loading && (
            <Text size="sm" role="status">
              Loading messages...
            </Text>
          )}
          {page?.error && (
            <>
              <Text size="sm">{page.error}</Text>
              <Button variant="default" onClick={() => client.conversations.load(peerId)}>
                Retry history
              </Button>
            </>
          )}
          {page && !page.loading && !entries.length && (
            <Text size="sm" c="dimmed">
              No messages yet.
            </Text>
          )}
          {entries.map((message) => (
            <Stack key={message.sequence} gap="xs">
              <Group gap="sm" justify="space-between">
                <Text size="sm" fw={700}>
                  {message.author}
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(message.savedAt).toLocaleString()}
                </Text>
              </Group>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {message.text}
              </Text>
              {message.senderFactionId === view.context?.factionId && (
                <Text size="xs" c="dimmed">
                  Sent
                </Text>
              )}
            </Stack>
          ))}
          <div ref={newest} style={{ minHeight: 1 }} aria-hidden />
          {pending.map((entry) => (
            <Stack key={entry.request.requestId} gap="xs">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {entry.request.text}
              </Text>
              <Group gap="sm">
                <Badge variant="default">{entry.status}</Badge>
                {entry.status === 'Failed' && (
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => client.conversations.retry(entry.request.requestId)}
                  >
                    Retry
                  </Button>
                )}
              </Group>
              {entry.error && <Text size="xs">{entry.error}</Text>}
            </Stack>
          ))}
        </Stack>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (client.conversations.submit(peerId, draft)) {
              setDraft('');
            }
          }}
        >
          <Stack gap="sm">
            <Textarea
              label="Message"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              maxLength={2000}
              autosize
              minRows={2}
              maxRows={5}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Sent means saved. No read receipts.
              </Text>
              <Button type="submit" disabled={!draft.trim()}>
                Send
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Section>
  );
}

export function OfflineConversations({ client }: Readonly<{ client: TableSession }>) {
  const { conversations: view } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [selected, select] = useState<string | null>(null);
  const peers = view.context?.peers ?? [];
  const peerId = peers.find((peer) => peer.id === selected)?.id ?? peers[0]?.id;
  if (!peerId) {
    return null;
  }
  return (
    <Stack gap="sm" w="min(36rem, 90vw)" mah="70vh" style={{ overflowY: 'auto' }}>
      <Select
        label="Faction conversation"
        value={peerId}
        onChange={select}
        data={peers.map((peer) => ({ value: peer.id, label: peer.name }))}
      />
      <Conversation key={`${view.context?.factionId}:${peerId}`} client={client} peerId={peerId} />
    </Stack>
  );
}
