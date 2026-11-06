import { Group, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ConversationMessage } from '@shared/play/conversations';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { History, RotateCcw } from 'lucide-react';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

import type { ConversationView } from '../../../../../db/tabletop/ConversationSession';
import { FactionTokenFace } from '../../multiplayer/FactionTokenFace';
import type { FactionToken } from '../../multiplayer/FactionTokenFace';
import { CONVERSATION_HELP } from '../../multiplayer/panelGuidance';
import { useServerNowAs } from '../../multiplayer/useServerNow';
import { ChatComposer } from './ChatComposer';
import styles from './ConversationPanel.module.css';
import type { Mention } from './mentions';
import { MentionCard, MentionText } from './MentionText';
import type { MentionActions } from './MentionText';

const EMPTY_MESSAGES: ConversationMessage[] = [];
const NO_MENTIONS: readonly Mention[] = [];
/* A message keeps its line breaks and wraps even a long unbroken word. */
const MESSAGE_TEXT_STYLE = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

type Page = ConversationView['pages'][string];
/* The seats a message can name, and what their cards can bring up. */
type Named = Readonly<{ mentions: readonly Mention[] }> & MentionActions;
type Pending = ConversationView['pending'][number];

export type ConversationPanelProps = Readonly<{
  /** The conversation's other side: a faction, or the whole table. */
  peerId: string;
  /** The viewer's own faction, whose messages read as sent. */
  factionId: string | undefined;
  /** Whether the table is connected; offline, messages wait to be sent. */
  online: boolean;
  /** The saved history so far, or undefined before it first loads. */
  page: Page | undefined;
  /** The viewer's messages on their way, oldest first. */
  pending: readonly Pending[];
  /** At the table every faction writes, so each message there also shows its writer's faction token and name; null in a chat with one player. */
  senders: Readonly<Record<string, FactionToken>> | null;
  /** Whether the newest message is unread, so seeing it marks the conversation read. */
  unread: boolean;
  /** Unsent messages by conversation, which outlive the composer. */
  drafts: Map<string, string>;
  onLoad: (before?: number) => void;
  onRead: (through: number) => void;
  onRetry: (requestId: string) => void;
  /** Sends a message; false keeps it in the composer. */
  onSubmit: (text: string) => boolean;
  /** Whether the viewer cleared this chat before, so an empty history says so rather than that nobody wrote. */
  cleared?: boolean;
  /** Who an @ in the composer suggests: the players and factions at the table; none in a chat with one player. */
  mentions?: readonly Mention[];
  /** Brings up the faction information of a seat a message names. */
  onMentionInfo?: (seat: string) => void;
  /** Opens the chat with the player of a seat a message names. */
  onMentionChat?: (seat: string) => void;
}>;

/** A conversation with one player or the table: its history, the viewer's pending messages and the composer. */
export function ConversationPanel({
  peerId,
  factionId,
  online,
  page,
  pending,
  senders,
  unread,
  drafts,
  onLoad,
  onRead,
  onRetry,
  onSubmit,
  cleared = false,
  mentions = NO_MENTIONS,
  onMentionInfo,
  onMentionChat,
}: ConversationPanelProps) {
  const named = { mentions, onInfo: onMentionInfo, onChat: onMentionChat };
  const entries = page?.entries ?? EMPTY_MESSAGES;
  const latest = entries.at(-1)?.sequence ?? 0;
  const { viewport, onScroll } = useConversationScroll(entries, pending.length);
  const newest = useVisibleRead(online && unread ? latest : null, onRead);
  const arrival = useArrivalAnnouncement(peerId, page, factionId);
  return (
    <Section hiddenHeading title="Conversation" help={CONVERSATION_HELP} className={styles.panel}>
      <Stack gap="sm" className={styles.body}>
        {!online && <Text size="sm">Offline. Pending messages will send after your faction access is checked.</Text>}
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
          <HistoryStatus page={page} load={onLoad} cleared={cleared} />
          {entries.map((message) => (
            <SavedMessage
              key={message.sequence}
              message={message}
              factionId={factionId}
              sender={senders?.[message.senderFactionId]}
              named={named}
            />
          ))}
          <div ref={newest} style={{ minHeight: 1 }} aria-hidden />
          {pending.map((entry) => (
            <PendingMessage key={entry.request.requestId} entry={entry} retry={onRetry} named={named} />
          ))}
        </Stack>
        <VisuallyHidden role="status">{arrival}</VisuallyHidden>
        <ChatComposer drafts={drafts} draftKey={`${factionId ?? ''}:${peerId}`} submit={onSubmit} mentions={mentions} />
      </Stack>
    </Section>
  );
}

/* Whether the history is scrolled to its newest message, give or take a few pixels of rounding. */
function atBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 8;
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
      bottom: atBottom(element),
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
    scroll.current.bottom = atBottom(element);
  };
  return { viewport, onScroll };
}

/* Marks the conversation read through its newest message once that message is seen; null while there is nothing to mark. */
function useVisibleRead(through: number | null, onRead: (through: number) => void) {
  const newest = useRef<HTMLDivElement>(null);
  const read = useEffectEvent(onRead);
  useEffect(() => {
    const target = newest.current;
    if (!target || through === null) {
      return;
    }
    return observeVisible(target, () => read(through));
  }, [through]);
  return newest;
}

/*
 * The history is a scrollback that also grows at the top when earlier pages load, so it is not itself live.
 * Only another faction's messages saved after the history first loaded are read out, one polite line per arrival.
 */
function useArrivalAnnouncement(peerId: string, page: Page | undefined, factionId: string | undefined) {
  const seen = useRef<{ peerId: string; sequence: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const settled = page !== undefined && page.load.state !== 'loading';
  const newest = page?.entries.at(-1);
  useEffect(() => {
    if (seen.current?.peerId !== peerId) {
      seen.current = null;
      setAnnouncement('');
    }
    if (!settled) {
      return;
    }
    const sequence = newest?.sequence ?? 0;
    const previous = seen.current?.sequence;
    if (previous !== undefined && newest && sequence > previous && newest.senderFactionId !== factionId) {
      setAnnouncement(`${newest.author}: ${newest.text}`);
    }
    seen.current = { peerId, sequence: Math.max(previous ?? 0, sequence) };
  }, [peerId, settled, newest, factionId]);
  return announcement;
}

/* The size of a writer's faction token behind their name: about the height of the name's capital letters plus a little. */
const SENDER_TOKEN_SIZE = 16;

function SavedMessage({
  message,
  factionId,
  sender,
  named,
}: Readonly<{ message: ConversationMessage; factionId?: string; sender?: FactionToken; named: Named }>) {
  return (
    <Stack gap="xs">
      <SavedMessageHeader
        message={message}
        sender={sender}
        seat={named.mentions.find((mention) => mention.token.id === message.senderFactionId)}
        actions={named}
      />
      <Text size="sm" style={MESSAGE_TEXT_STYLE}>
        <MentionText text={message.text} {...named} />
      </Text>
      {message.senderFactionId === factionId && (
        <Text size="xs" c="dimmed" data-saved-own-message>
          Sent
        </Text>
      )}
    </Stack>
  );
}

function PendingMessage({
  entry,
  retry,
  named,
}: Readonly<{ entry: Pending; retry: (requestId: string) => void; named: Named }>) {
  return (
    <Stack gap="xs">
      <Text size="sm" style={MESSAGE_TEXT_STYLE}>
        <MentionText text={entry.request.text} {...named} />
      </Text>
      <PendingStatus entry={entry} retry={retry} />
    </Stack>
  );
}

function HistoryStatus({
  page,
  load,
  cleared,
}: Readonly<{ page: Page | undefined; load: (before?: number) => void; cleared: boolean }>) {
  if (!page) {
    return null;
  }
  const loading = page.load.state === 'loading';
  return (
    <>
      {page.more && (
        <LabeledAction icon={<History size={16} />} busy={loading} onClick={() => load(page.entries[0]!.sequence)}>
          Earlier messages
        </LabeledAction>
      )}
      <HistoryLoad load={page.load} retry={() => load()} />
      {!loading && !page.entries.length && (
        <Text size="sm" c="dimmed">
          {cleared ? 'You cleared this chat.' : 'No messages yet.'}
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
  /* A viewport-root observer accounts for both the scrollback and the surrounding window being off-screen. */
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

/*
 * The writer's name, then at the table their faction's token and name; hovering the token shows their seat's card, as an @ naming it does.
 * In a narrow window the token and faction name move under the name together, and the time onto its own line, rather than overlap.
 */
function SavedMessageHeader({
  message,
  sender,
  seat,
  actions,
}: Readonly<{ message: ConversationMessage; sender?: FactionToken; seat?: Mention; actions: MentionActions }>) {
  const token = sender && (
    <FactionTokenFace token={sender} size={SENDER_TOKEN_SIZE} style={{ flexShrink: 0 }} aria-hidden />
  );
  return (
    <Group gap="sm" justify="space-between">
      <Group gap={6} data-message-sender={sender?.id}>
        <Text size="sm" fw={700}>
          {message.author}
        </Text>
        {sender ? (
          <Group gap={6} wrap="nowrap">
            {seat && token ? (
              <MentionCard mention={seat} {...actions}>
                {token}
              </MentionCard>
            ) : (
              token
            )}
            <Text span size="sm" c="dimmed">
              {sender.name}
            </Text>
          </Group>
        ) : null}
      </Group>
      <MessageTime savedAt={message.savedAt} />
    </Group>
  );
}

const RELATIVE_UNITS = [
  { limit: 3600, seconds: 60, unit: 'minute' },
  { limit: 86_400, seconds: 3600, unit: 'hour' },
  { limit: Infinity, seconds: 86_400, unit: 'day' },
] as const;

/* One formatter for every message's time, built once rather than on each render. */
const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

function relativeMessageTime(savedAt: number, now: number) {
  const elapsed = Math.max(0, (now - savedAt) / 1000);
  if (elapsed < 60) {
    return 'Just now';
  }
  const scale = RELATIVE_UNITS.find((entry) => elapsed < entry.limit)!;
  return RELATIVE_TIME.format(-Math.floor(elapsed / scale.seconds), scale.unit);
}

/*
 * Saved history exists only while the table is connected, so every caller sits inside the server clock's provider.
 * The time renders again only when its words change, at most once a minute, not on every tick of the clock.
 */
function MessageTime({ savedAt }: Readonly<{ savedAt: number }>) {
  const label = useServerNowAs((now) => relativeMessageTime(savedAt, now));
  const date = new Date(savedAt);
  return (
    <Tooltip label={date.toLocaleString()}>
      <Text component="time" dateTime={date.toISOString()} size="xs" c="dimmed">
        {label}
      </Text>
    </Tooltip>
  );
}

function PendingStatus({ entry, retry }: Readonly<{ entry: Pending; retry: (requestId: string) => void }>) {
  const { delivery, request } = entry;
  switch (delivery.state) {
    case 'unsent':
    case 'sent':
      return (
        <Group gap="sm">
          <StatusBadge tone="pending">Pending</StatusBadge>
        </Group>
      );
    case 'failed':
      return (
        <>
          <Group gap="sm">
            <StatusBadge tone="negative">Failed</StatusBadge>
            <IconAction
              label="Retry"
              size="sm"
              emphasis="quiet"
              icon={<RotateCcw size={14} aria-hidden />}
              onClick={() => retry(request.requestId)}
            />
          </Group>
          <Text size="xs" role="alert">
            {delivery.error}
          </Text>
        </>
      );
  }
}

function HistoryLoad({ load, retry }: Readonly<{ load: Page['load']; retry: () => void }>) {
  switch (load.state) {
    case 'idle':
      return null;
    case 'loading':
      return (
        <Text size="sm" role="status">
          Loading messages...
        </Text>
      );
    case 'failed':
      return (
        <>
          <Text size="sm">{load.error}</Text>
          <LabeledAction icon={<RotateCcw size={16} aria-hidden />} onClick={retry}>
            Retry history
          </LabeledAction>
        </>
      );
  }
}
