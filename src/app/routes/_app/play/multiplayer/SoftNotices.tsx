import { Text } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ConversationMessage } from '@shared/play/conversations';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { GameSnapshot } from '@shared/play/protocol';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { AtSign, Coins, Gavel, Handshake, MessageCircle, Sailboat, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { ownStep } from '../../../../db/tabletop/OwnChanges';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { splitMentions } from '../panels/chat/mentions';
import type { Mention } from '../panels/chat/mentions';
import { isViewingConversation } from '../panels/chat/viewingConversations';
import type { FactionToken } from './FactionTokenFace';
import { FactionTokenFace, snapshotFactionToken } from './FactionTokenFace';
import { noticeStillHolds, noticesBetween, onlyReordered, ownMovementOrder } from './noticeEvents';
import type { NoticeDraft, SoftNoticeKind } from './noticeEvents';
import type { NoticeStart } from './noticeStart';
import styles from './SoftNotices.module.css';
import { stageInPlay } from './tableFactions';

type SoftNotice = Readonly<{
  id: string;
  kind: SoftNoticeKind;
  /** One line, as the viewer reads it: "Your turn to bid", "Harkonnen paid you 3 spice". */
  text: string;
  /** The faction it came from, or the viewer's own for their turn; null for a gift whose giver the table did not record. */
  from: FactionToken | null;
  /** When it arrived, on this page's own clock (`performance.now()`): a notice is the page's, not the table's. */
  at: number;
  /** A chat message's words, cut where they name the viewer's own seat. */
  quote?: readonly QuoteSegment[];
  /** The panel it opens, where that is not its kind's: the chat a message came in. */
  opens?: string;
}>;

type QuoteSegment = Readonly<{ text: string; own?: boolean }>;

/**
 * PROTOTYPE (#2981 follow-up): how a chat notice shows, while the owner picks one.
 * `named` names who mentioned the viewer;
 * `quoted` puts their words on the same line;
 * `twoLines` puts them under it;
 * `marked` does that with the viewer's own name marked;
 * `private` is `twoLines`, and a private chat message notifies as well.
 */
export type ChatNoticeStyle = 'named' | 'quoted' | 'twoLines' | 'marked' | 'private';
export const ChatNoticeStyleContext = createContext<ChatNoticeStyle>('twoLines');

const ICONS: Record<SoftNoticeKind, LucideIcon> = {
  bid: Gavel,
  ship: Sailboat,
  battle: Swords,
  spice: Coins,
  alliance: Handshake,
  mention: AtSign,
  message: MessageCircle,
};

/** The viewer's own turns, which the screen's edge glows for as well. */
const TURN_KINDS: ReadonlySet<SoftNoticeKind> = new Set(['bid', 'ship', 'battle']);

/** How long a notice shows before it is gone, and how long its fade takes before that. The turn's glow is a CSS animation of its own. */
const LIFETIME_MS = 6000;
const FADE_MS = 400;

/** How long a notice shows; a story holds its notices with an endless one, so a slow runner never loses them before it looks. */
export const NoticeLifetime = createContext(LIFETIME_MS);
/** The most notices kept at once; older ones have long gone. */
const KEPT = 12;

/*
 * Whether a raised notice is news to the viewer. Setup has no turns, so turn notices wait for play.
 * A turn to ship that came of the viewer's own drag of the movement order is not news: they put themselves first.
 * Only a change that just reordered counts as that, into exactly the order the viewer asked for, so a faction finishing or another player's reorder still hands on a real turn.
 */
function newsFor(
  draft: NoticeDraft,
  context: Readonly<{ playing: boolean; ownOrder: readonly string[] | null; before: GameSnapshot; after: GameSnapshot }>
): boolean {
  if (!TURN_KINDS.has(draft.kind)) {
    return true;
  }
  const { playing, ownOrder, before, after } = context;
  const ownDrag = draft.kind === 'ship' && onlyReordered(before, after) && ownMovementOrder(ownOrder, after);
  return playing && !ownDrag;
}

/* The notices still standing at the table, then the newly raised ones, newest last and at most KEPT of them. */
function keptAndRaised(
  all: readonly SoftNotice[],
  raised: readonly NoticeDraft[],
  context: Readonly<{ snapshot: GameSnapshot; own: string; names: Readonly<Record<string, string>>; at: number }>
): readonly SoftNotice[] {
  const { snapshot, own, names, at } = context;
  const kept = all.filter((notice) => noticeStillHolds(snapshot, own, { key: notice.id, kind: notice.kind }));
  if (!raised.length && kept.length === all.length) {
    return all;
  }
  const known = new Set(kept.map((notice) => notice.id));
  const fresh = raised
    .filter((draft) => !known.has(draft.key))
    .map((draft) => ({
      id: draft.key,
      kind: draft.kind,
      text: draft.text,
      from: draft.factionId === null ? null : snapshotFactionToken(snapshot, draft.factionId, names),
      at,
    }));
  return [...kept, ...fresh].slice(-KEPT);
}

/**
 * The soft notices the live table raises for the viewer as it changes, newest last.
 * Each change is compared with the one before it, starting from the first live table the page showed, so joining or reloading raises nothing for what already happened.
 * A recall, playback or lost connection clears them, since what they point at is not on screen, and a turn that has passed takes its notice with it.
 * The baseline only moves with the table's revision, so the viewer's own drag of the movement order, shown before the table answers, never stands in for the table.
 */
function useSoftNotices(table: TableProjection, start: NoticeStart | null): readonly SoftNotice[] {
  const own = start?.own;
  const snapshot = table.confirmedSnapshot ?? table.snapshot;
  const mine = table.ownChanges;
  const playing = stageInPlay(table.snapshot.stage);
  const previous = useRef<Readonly<{ own: string; snapshot: GameSnapshot }> | null>(start);
  const [notices, setNotices] = useState<readonly SoftNotice[]>([]);
  const [shownFor, setShownFor] = useState(own);
  if (shownFor !== own) {
    setShownFor(own);
    setNotices([]);
  }
  useEffect(() => {
    /* A faction newly acted for starts from the table the page first showed it at. */
    const before = previous.current?.own === own ? previous.current : start;
    if (!own || !before) {
      previous.current = null;
      return;
    }
    if (before.snapshot.revision === snapshot.revision) {
      return;
    }
    previous.current = { own, snapshot };
    const names = snapshotFactionLabels(snapshot);
    /*
     * What the viewer's own commands changed is kept by the connection, so a change made before this code loaded still counts.
     * Only the changes this step brought count, so an order or claim the viewer made long ago never hides a later turn.
     */
    const { completed, ownOrder } = ownStep(mine?.changes, before.snapshot, snapshot);
    const raised = noticesBetween(before.snapshot, snapshot, own, names, completed).filter((draft) =>
      newsFor(draft, { playing, ownOrder, before: before.snapshot, after: snapshot })
    );
    const at = performance.now();
    setNotices((all) => keptAndRaised(all, raised, { snapshot, own, names, at }));
  }, [own, start, snapshot, mine, playing]);
  return notices;
}

/* Every seat at the table as a chat names it, its faction's name after an @; the viewer's own marked. */
function seatMentions(table: TableProjection): Mention[] {
  const viewerSeat = table.viewer.viewerSeat;
  return (table.snapshot.roster?.seats ?? []).flatMap((seat) =>
    seat.faction
      ? [
          {
            id: seat.id,
            label: seat.faction.name,
            detail: null,
            token: { id: seat.faction.id, name: seat.faction.name },
            own: seat.id === viewerSeat,
          },
        ]
      : []
  );
}

/*
 * The notice a chat message raises for the viewer, if any: the table chat when it names their seat after an @,
 * and with the `private` style, any message in a private chat.
 */
function chatNotice(
  table: TableProjection,
  peerId: string,
  message: ConversationMessage,
  style: ChatNoticeStyle,
  at: number
): SoftNotice | null {
  const snapshot = table.confirmedSnapshot ?? table.snapshot;
  const names = snapshotFactionLabels(snapshot);
  const sender = names[message.senderFactionId] ?? message.senderFactionId;
  const from = snapshotFactionToken(snapshot, message.senderFactionId, names);
  const id = `chat-${peerId}-${message.sequence}`;
  if (peerId === TABLE_CONVERSATION) {
    const segments = splitMentions(message.text, seatMentions(table));
    if (!segments.some((segment) => segment.seats?.some((seat) => seat.own))) {
      return null;
    }
    const quote = segments.map((segment) => ({
      text: segment.text,
      ...(segment.seats?.some((seat) => seat.own) && { own: true }),
    }));
    return { id, kind: 'mention', text: `${sender} mentioned you`, from, at, quote, opens: 'table-chat' };
  }
  if (style !== 'private' || peerId.startsWith('@')) {
    return null;
  }
  const seat = snapshot.roster?.seats.find((entry) => entry.faction?.id === message.senderFactionId)?.id;
  return {
    id,
    kind: 'message',
    text: `${sender} wrote to you`,
    from,
    at,
    quote: [{ text: message.text }],
    ...(seat && { opens: `player:${seat}` }),
  };
}

/**
 * The notices chat messages raise for the viewer as they arrive: a mention of their seat in the table chat.
 * A conversation the viewer is reading already raises none, and acting for another faction starts afresh.
 */
function useChatNotices(
  table: TableProjection,
  subscribeMessages: SubscribeMessages | undefined,
  own: string | undefined
): readonly SoftNotice[] {
  const style = useContext(ChatNoticeStyleContext);
  const [notices, setNotices] = useState<readonly SoftNotice[]>([]);
  const [shownFor, setShownFor] = useState(own);
  if (shownFor !== own) {
    setShownFor(own);
    setNotices([]);
  }
  /* A message is read against the table as it is when it arrives. */
  const hear = useEffectEvent((peerId: string, message: ConversationMessage) => {
    if (isViewingConversation(peerId)) {
      return;
    }
    const notice = chatNotice(table, peerId, message, style, performance.now());
    if (notice) {
      setNotices((all) => [...all.filter((kept) => kept.id !== notice.id), notice].slice(-KEPT));
    }
  });
  useEffect(() => {
    if (!own || !subscribeMessages) {
      return;
    }
    return subscribeMessages(hear);
  }, [subscribeMessages, own]);
  return notices;
}

type SubscribeMessages = (listener: (peerId: string, message: ConversationMessage) => void) => () => void;

/**
 * The viewer's soft notifications (#2981), laid over the table inside its shell: small toasts under the phase header, each with the token of the faction it came from and one line, that fade after a few seconds.
 * When it is the viewer's turn the screen's edge glows softly as well.
 * Clicking one opens what it is about, where it has a place to open, and dismisses it.
 */
function SoftNotices({
  notices,
  inert,
  onOpen,
}: Readonly<{ notices: readonly SoftNotice[]; inert: boolean; onOpen?: (notice: SoftNotice) => void }>) {
  const motion = useMotionAllowed();
  const lifetime = useContext(NoticeLifetime);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  /* Each notice starts to fade a moment before its lifetime ends, then leaves: one timer for each step, not a ticking clock. */
  useEffect(() => {
    const current = new Set(notices.map((notice) => notice.id));
    /* Marks one notice, keeping only notices still kept, so neither set outgrows the list. */
    const mark = (id: string) => (before: ReadonlySet<string>) =>
      new Set([...before].filter((known) => current.has(known))).add(id);
    const after = (notice: SoftNotice, ms: number, step: (id: string) => void) =>
      window.setTimeout(() => step(notice.id), Math.max(0, notice.at + ms - performance.now()));
    const timers = Number.isFinite(lifetime)
      ? notices
          .filter((notice) => !gone.has(notice.id))
          .flatMap((notice) => [
            after(notice, lifetime - FADE_MS, (id) => setLeaving(mark(id))),
            after(notice, lifetime, (id) => setGone(mark(id))),
          ])
      : [];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [notices, gone, lifetime]);
  /* Newest first: the list runs oldest to newest, a batch from one change included, so its newest take the slots. */
  const live = notices.filter((notice) => !gone.has(notice.id)).toReversed();
  const open = (notice: SoftNotice) => {
    const current = new Set(notices.map((kept) => kept.id));
    setGone((before) => new Set([...before].filter((known) => current.has(known))).add(notice.id));
    onOpen?.(notice);
  };
  /*
   * The newest turn glows the screen's edge once, as its own animation, so a later notice does not restart it.
   * Only the newest: dismissing it leaves an older turn's toast showing, which has glowed already.
   */
  const newestTurn = notices.findLast((notice) => TURN_KINDS.has(notice.kind));
  const turn = newestTurn && live.includes(newestTurn) ? newestTurn : undefined;

  return (
    <div
      className={styles.root}
      data-motion={motion || undefined}
      role="log"
      aria-live="polite"
      aria-label="Notifications"
    >
      {turn && <div key={turn.id} className={styles.glow} data-glow aria-hidden />}
      {/* A board gesture only takes the pointer from the toasts; they stay in the accessibility tree, so the log still announces what arrives meanwhile. */}
      <div className={styles.stack} data-gesture={inert || undefined}>
        {live.slice(0, 4).map((notice) => (
          <div
            key={notice.id}
            className={styles.slot}
            data-leaving={leaving.has(notice.id) || undefined}
            inert={leaving.has(notice.id)}
          >
            <Toast notice={notice} onOpen={open} held={inert} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* While a board gesture holds the pointer the toast cannot be opened, by pointer or by keyboard, but it stays readable. */
function Toast({
  notice,
  onOpen,
  held,
}: Readonly<{ notice: SoftNotice; onOpen: (notice: SoftNotice) => void; held: boolean }>) {
  const Icon = ICONS[notice.kind];
  const style = useContext(ChatNoticeStyleContext);
  return (
    <Surface
      padding="sm"
      interactive
      className={clsx(styles.toast, TURN_KINDS.has(notice.kind) && styles.turn)}
      renderRoot={(props) => <button type="button" {...props} disabled={held} onClick={() => onOpen(notice)} />}
    >
      {notice.from && <FactionTokenFace token={notice.from} size={28} aria-hidden />}
      <NoticeWords notice={notice} style={style} />
      <Icon size={16} aria-hidden className={styles.icon} />
    </Surface>
  );
}

/* A notice's line, and a chat message's words where the style shows them: on the same line, or under it. */
function NoticeWords({ notice, style }: Readonly<{ notice: SoftNotice; style: ChatNoticeStyle }>) {
  const quote = notice.quote;
  if (!quote || style === 'named') {
    return (
      <Text size="sm" className={styles.line}>
        {notice.text}
      </Text>
    );
  }
  const words = quote.map((segment) => segment.text).join('');
  if (style === 'quoted') {
    const sender = notice.from?.name ?? '';
    return (
      <Text size="sm" className={clsx(styles.line, styles.single)}>
        <strong>{sender}:</strong> {words}
      </Text>
    );
  }
  const marked: ReactNode =
    style === 'marked'
      ? quote.map((segment, index) =>
          segment.own ? (
            <mark key={index} className={styles.own}>
              {segment.text}
            </mark>
          ) : (
            segment.text
          )
        )
      : words;
  return (
    <div className={styles.line}>
      <Text size="sm">{notice.text}</Text>
      <Text size="xs" lineClamp={2} className={styles.quote}>
        {marked}
      </Text>
    </div>
  );
}

/*
 * The panel each notice opens; the battle opens its planner, and the turn to ship and move is played on the table itself.
 * Spice opens the transfers, which record a bribe still lying on the table as well as a payment.
 */
const PANELS: Partial<Record<SoftNoticeKind, string>> = { alliance: 'alliances', bid: 'hand', spice: 'transfers' };

/**
 * The live table's soft notices, raised and shown in one, each opening what it is about.
 * The table loads this lazily, which keeps its own bundle within its budget.
 */
export function TableSoftNotices({
  table,
  start,
  inert,
  openPanel,
  openBattlePlan,
  subscribeMessages,
}: Readonly<{
  table: TableProjection;
  start: NoticeStart | null;
  /** Each chat message another faction writes to the viewer, as it arrives. */
  subscribeMessages?: SubscribeMessages;
  /** Whether a board gesture holds the pointer, when no notice may be opened. */
  inert: boolean;
  openPanel: (key: string) => void;
  openBattlePlan: (() => void) | null;
}>) {
  const open = (notice: SoftNotice) => {
    const panel = notice.opens ?? PANELS[notice.kind];
    if (panel) {
      openPanel(panel);
    } else if (notice.kind === 'battle') {
      openBattlePlan?.();
    }
  };
  const fromTable = useSoftNotices(table, start);
  const fromChat = useChatNotices(table, subscribeMessages, start?.own);
  const notices = fromChat.length ? [...fromTable, ...fromChat].toSorted((a, b) => a.at - b.at) : fromTable;
  return <SoftNotices notices={notices} inert={inert} onOpen={open} />;
}
