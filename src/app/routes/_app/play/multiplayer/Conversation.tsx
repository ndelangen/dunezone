import { Badge, Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import type { ConversationMessage } from '@shared/play/conversations';
import { Section } from '@ui/block/Section';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import styles from './Conversation.module.css';
import type { ConversationView } from './ConversationSession';
import type { TableSession } from './TableSession';

const EMPTY_MESSAGES: ConversationMessage[] = [];

/** The caller selects the faction pair; this panel owns composing and observing the visible newest message. */
export function Conversation({ client, peerId }: Readonly<{ client: TableSession; peerId: string }>) {
  const { conversations: view } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const page = view.pages[peerId];
  const entries = page?.entries ?? EMPTY_MESSAGES;
  const latest = entries.at(-1)?.sequence ?? 0;
  const pending = view.pending.filter((entry) => entry.request.peerId === peerId);
  useEffect(() => {
    if (view.online && !page) {
      client.conversations.load({ peerId });
    }
  }, [client, peerId, page, view.online]);
  const { viewport, onScroll } = useConversationScroll(entries, pending.length);
  const newest = useVisibleRead(client, peerId, latest, view);
  return (
    <Section helpOnly title="Conversation" description="Sent means saved. No read receipts." className={styles.panel}>
      <Stack gap="sm" className={styles.body}>
        {!view.online && (
          <Text size="sm">Offline. Pending messages will send after your faction access is checked.</Text>
        )}
        <Stack
          ref={viewport}
          gap="sm"
          className={styles.history}
          style={{ overflowY: 'auto', overflowAnchor: 'none' }}
          role="region"
          aria-label="Conversation history"
          tabIndex={0}
          onScroll={onScroll}
        >
          <HistoryStatus page={page} load={(before) => client.conversations.load({ peerId, before })} />
          {entries.map((message) => (
            <SavedMessage key={message.sequence} message={message} factionId={view.context?.factionId} />
          ))}
          <div ref={newest} style={{ minHeight: 1 }} aria-hidden />
          {pending.map((entry) => (
            <PendingMessage key={entry.request.requestId} entry={entry} retry={client.conversations.retry} />
          ))}
        </Stack>
        <Composer submit={(text) => client.conversations.submit({ peerId, text })} />
      </Stack>
    </Section>
  );
}

export function OfflineConversations({ client }: Readonly<{ client: TableSession }>) {
  const { conversations: view } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const peers = view.context?.peers ?? [];
  const peerId = peers.find((peer) => peer.id === selected)?.id ?? peers[0]?.id;
  if (!peerId) {
    return null;
  }
  return (
    <Stack gap="sm" w="min(36rem, 90vw)" h="70vh" style={{ overflow: 'hidden' }}>
      <Select
        label="Faction conversation"
        value={peerId}
        onChange={setSelected}
        data={peers.map((peer) => ({ value: peer.id, label: peer.name }))}
      />
      <Conversation key={`${view.context?.factionId}:${peerId}`} client={client} peerId={peerId} />
    </Stack>
  );
}

function useConversationScroll(entries: ConversationMessage[], pendingCount: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const scroll = useRef({ bottom: true, height: 0, first: 0 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) {
      return;
    }
    const previous = scroll.current;
    const first = entries[0]?.sequence ?? 0;
    const prepended = first > 0 && previous.first > first;
    if (prepended) {
      element.scrollTop += element.scrollHeight - previous.height;
    } else if (previous.bottom) {
      element.scrollTop = element.scrollHeight;
    }
    scroll.current = {
      bottom: element.scrollHeight - element.scrollTop - element.clientHeight < 8,
      first,
      height: element.scrollHeight,
    };
  }, [entries, pendingCount]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (scroll.current.bottom) {
        element.scrollTop = element.scrollHeight;
      }
      scroll.current.height = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const element = viewport.current!;
    scroll.current.bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 8;
  };
  return { viewport, onScroll };
}

function useVisibleRead(client: TableSession, peerId: string, latest: number, view: ConversationView) {
  const newest = useRef<HTMLDivElement>(null);
  const summary = view.summaries.find((entry) => entry.peerId === peerId);
  useEffect(() => {
    const target = newest.current;
    if (!target || !view.online) {
      return;
    }
    if (!summary?.unread || latest !== summary.latest) {
      return;
    }
    return observeVisible(target, () => client.conversations.read({ peerId, through: latest }));
  }, [client, peerId, latest, summary?.latest, summary?.unread, view.online]);
  return newest;
}

function SavedMessage({ message, factionId }: Readonly<{ message: ConversationMessage; factionId?: string }>) {
  return (
    <Stack gap="xs">
      <SavedMessageHeader message={message} />
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {message.text}
      </Text>
      {message.senderFactionId === factionId && (
        <Text size="xs" c="dimmed">
          Sent
        </Text>
      )}
    </Stack>
  );
}

function PendingMessage({
  entry,
  retry,
}: Readonly<{ entry: ConversationView['pending'][number]; retry: (requestId: string) => void }>) {
  return (
    <Stack gap="xs">
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {entry.request.text}
      </Text>
      <PendingStatus entry={entry} retry={retry} />
      {entry.error && <Text size="xs">{entry.error}</Text>}
    </Stack>
  );
}

function Composer({ submit }: Readonly<{ submit: (text: string) => boolean }>) {
  const [draft, setDraft] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (submit(draft)) {
          setDraft('');
        }
      }}
    >
      <Stack gap="sm">
        <Textarea
          aria-label="Message"
          placeholder="Message"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          maxLength={2000}
          autosize
          minRows={2}
          maxRows={5}
        />
        <ComposerSubmit disabled={!draft.trim()} />
      </Stack>
    </form>
  );
}

function HistoryStatus({
  page,
  load,
}: Readonly<{ page: ConversationView['pages'][string] | undefined; load: (before?: number) => void }>) {
  if (!page) {
    return null;
  }
  return (
    <>
      {page.more && (
        <Button variant="subtle" loading={Boolean(page.loading)} onClick={() => load(page.entries[0]!.sequence)}>
          Earlier messages
        </Button>
      )}
      {page.loading && (
        <Text size="sm" role="status">
          Loading messages...
        </Text>
      )}
      {page.error && <HistoryError error={page.error} retry={() => load()} />}
      {!page.loading && !page.entries.length && (
        <Text size="sm" c="dimmed">
          No messages yet.
        </Text>
      )}
    </>
  );
}

function observeVisible(target: HTMLElement, onVisible: () => void) {
  let visible = false;
  const read = () => {
    if (visible && document.visibilityState === 'visible') {
      onVisible();
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
}

function SavedMessageHeader({ message }: Readonly<{ message: ConversationMessage }>) {
  return (
    <Group gap="sm" justify="space-between">
      <Text size="sm" fw={700}>
        {message.author}
      </Text>
      <MessageTime savedAt={message.savedAt} />
    </Group>
  );
}

const RELATIVE_UNITS = [
  { limit: 3600, seconds: 60, unit: 'minute' },
  { limit: 86_400, seconds: 3600, unit: 'hour' },
  { limit: Infinity, seconds: 86_400, unit: 'day' },
] as const;

function relativeMessageTime(savedAt: number, now: number) {
  const elapsed = Math.max(0, (now - savedAt) / 1000);
  if (elapsed < 60) {
    return 'Just now';
  }
  const scale = RELATIVE_UNITS.find((entry) => elapsed < entry.limit)!;
  return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(
    -Math.floor(elapsed / scale.seconds),
    scale.unit
  );
}

function MessageTime({ savedAt }: Readonly<{ savedAt: number }>) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const date = new Date(savedAt);
  return (
    <Text component="time" dateTime={date.toISOString()} title={date.toLocaleString()} size="xs" c="dimmed">
      {relativeMessageTime(savedAt, now)}
    </Text>
  );
}

function PendingStatus({
  entry,
  retry,
}: Readonly<{ entry: ConversationView['pending'][number]; retry: (requestId: string) => void }>) {
  return (
    <Group gap="sm">
      <Badge variant="default">{entry.status}</Badge>
      {entry.status === 'Failed' && (
        <Button variant="subtle" size="compact-sm" onClick={() => retry(entry.request.requestId)}>
          Retry
        </Button>
      )}
    </Group>
  );
}

function ComposerSubmit({ disabled }: Readonly<{ disabled: boolean }>) {
  return (
    <Group justify="flex-end">
      <Button type="submit" disabled={disabled}>
        Send
      </Button>
    </Group>
  );
}

function HistoryError({ error, retry }: Readonly<{ error: string; retry: () => void }>) {
  return (
    <>
      <Text size="sm">{error}</Text>
      <Button variant="default" onClick={retry}>
        Retry history
      </Button>
    </>
  );
}
