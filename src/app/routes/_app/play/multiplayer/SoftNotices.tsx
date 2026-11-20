import { Text } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ConversationMessage } from '@shared/play/conversations';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { Vector3Tuple } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import type { TablePing } from '@shared/play/protocol';
import { territoryAtTable } from '@shared/play/territoryPlacement';
import { troopReserveKeys, troopReserveSpots } from '@shared/play/troopReserves';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { AtSign, Coins, Gavel, Handshake, MapPin, MessageCircle, Sailboat, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { ownStep } from '../../../../db/tabletop/OwnChanges';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { splitMentions } from '../panels/chat/mentions';
import type { Mention } from '../panels/chat/mentions';
import { isViewingConversation } from '../panels/chat/viewingConversations';
import { useChatNotices } from './chatNotices';
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
  /** A chat message's words, shown quieter under the line. */
  quote?: string;
  /** The panel it opens, where that is not its kind's: the chat a message came in. */
  opens?: string;
  /** The spot on the table it is about, which the camera looks at when it is opened: where a ping landed. */
  spot?: Vector3Tuple;
}>;

/**
 * PROTOTYPE (#2981 follow-up): which pings notify, while the owner picks.
 * `off` none, as today;
 * `pieces` a ping on the viewer's own pieces;
 * `place` that, naming the territory;
 * `every` any other player's ping.
 */
export type PingNoticeStyle = 'off' | 'pieces' | 'place' | 'every';
export const PingNoticeStyleContext = createContext<PingNoticeStyle>('place');

/**
 * PROTOTYPE (#2981 follow-up): what the "Your turn to ship and move" toast does when clicked, while the owner picks.
 * `close` only closes it, as today;
 * `map` returns the camera to the Map view;
 * `reserves` has the camera glide to the viewer's reserves behind their seat.
 */
export type ShipToastStyle = 'close' | 'map' | 'reserves';
export const ShipToastStyleContext = createContext<ShipToastStyle>('reserves');

/* Where the viewer's troop reserves stand behind their seat: the middle of them, or nothing for a faction with none. */
function reservesSpot(table: TableProjection, own: string): Vector3Tuple | undefined {
  const snapshot = table.confirmedSnapshot ?? table.snapshot;
  const spots = troopReserveSpots(snapshot.roster, own, troopReserveKeys(snapshot.table.pieces, own));
  if (!spots?.length) {
    return undefined;
  }
  const sum = spots.reduce<Vector3Tuple>(
    (total, { position }) => [total[0] + position[0], total[1] + position[1], total[2] + position[2]],
    [0, 0, 0]
  );
  return [sum[0] / spots.length, sum[1] / spots.length, sum[2] / spots.length];
}

/* How near one of the viewer's pieces a ping lands to be about them, in table units: about a troop stack's width. */
const PING_NEAR = 0.25;

const ICONS: Record<SoftNoticeKind, LucideIcon> = {
  bid: Gavel,
  ship: Sailboat,
  battle: Swords,
  spice: Coins,
  alliance: Handshake,
  mention: AtSign,
  message: MessageCircle,
  ping: MapPin,
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

/* The notice a chat message raises for the viewer, if any: the table chat when it names their seat after an @, and any message in a private chat (Norbert, 2026-11-21). */
function chatNotice(
  table: TableProjection,
  peerId: string,
  message: ConversationMessage,
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
    return { id, kind: 'mention', text: `${sender} mentioned you`, from, at, quote: message.text, opens: 'table-chat' };
  }
  /* Only a private chat is named by the faction on its other side; the table's and a recall's start with an @. */
  if (peerId.startsWith('@')) {
    return null;
  }
  const seat = snapshot.roster?.seats.find((entry) => entry.faction?.id === message.senderFactionId)?.id;
  return {
    id,
    kind: 'message',
    text: `${sender} wrote to you`,
    from,
    at,
    quote: message.text,
    ...(seat && { opens: `player:${seat}` }),
  };
}

/**
 * The notices chat messages raise for the viewer as they arrive: a mention of their seat in the table chat, or a private message.
 * A conversation the viewer is reading already raises none, none at all while they turned chat notices off in the game menu, and acting for another faction starts afresh.
 */
function useChatMessageNotices(
  table: TableProjection,
  subscribeMessages: SubscribeMessages | undefined,
  own: string | undefined
): readonly SoftNotice[] {
  const enabled = useChatNotices();
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
    const notice = chatNotice(table, peerId, message, performance.now());
    if (notice) {
      setNotices((all) => [...all.filter((kept) => kept.id !== notice.id), notice].slice(-KEPT));
    }
  });
  useEffect(() => {
    if (!own || !subscribeMessages || !enabled) {
      return;
    }
    return subscribeMessages(hear);
  }, [subscribeMessages, own, enabled]);
  return notices;
}

/* The notice another player's ping raises for the viewer, if the style counts it. */
function pingNotice(table: TableProjection, ping: TablePing, style: PingNoticeStyle, at: number): SoftNotice | null {
  const snapshot = table.confirmedSnapshot ?? table.snapshot;
  const own = table.viewer.viewerSeat ? seatFactionId(snapshot, table.viewer.viewerSeat) : undefined;
  const pinger = seatFactionId(snapshot, ping.viewerSeat);
  if (style === 'off' || !own || !pinger || pinger === own) {
    return null;
  }
  const [x, , z] = ping.position;
  const onOwn = snapshot.table.pieces.some(
    (piece) => piece.owner === own && Math.hypot(piece.position[0] - x, piece.position[2] - z) <= PING_NEAR
  );
  if (style !== 'every' && !onOwn) {
    return null;
  }
  const names = snapshotFactionLabels(snapshot);
  const place = territoryAtTable({ board: snapshot.board?.definition }, ping.position)?.name;
  const what =
    style === 'pieces'
      ? 'your pieces'
      : style === 'place'
        ? `your pieces${place ? ` in ${place}` : ''}`
        : onOwn
          ? `your pieces${place ? ` in ${place}` : ''}`
          : (place ?? 'the table');
  return {
    id: `ping-${pinger}-${at}`,
    kind: 'ping',
    text: `${names[pinger] ?? pinger} pinged ${what}`,
    from: snapshotFactionToken(snapshot, pinger, names),
    at,
    spot: ping.position,
  };
}

const seatFactionId = (snapshot: GameSnapshot, seat: string) =>
  snapshot.roster?.seats.find((entry) => entry.id === seat)?.faction?.id;

/* The notices other players' pings raise: one at a time from each player, the newest replacing the last. */
function usePingNotices(
  table: TableProjection,
  subscribePings: SubscribePings | undefined,
  own: string | undefined
): readonly SoftNotice[] {
  const style = useContext(PingNoticeStyleContext);
  const [notices, setNotices] = useState<readonly SoftNotice[]>([]);
  const [shownFor, setShownFor] = useState(own);
  if (shownFor !== own) {
    setShownFor(own);
    setNotices([]);
  }
  const hear = useEffectEvent((ping: TablePing) => {
    if (ping.connectionId === table.viewer.connectionId) {
      return;
    }
    const notice = pingNotice(table, ping, style, performance.now());
    if (notice) {
      const sameSender = (kept: SoftNotice) => kept.from?.id === notice.from?.id;
      setNotices((all) => [...all.filter((kept) => !sameSender(kept)), notice].slice(-KEPT));
    }
  });
  useEffect(() => {
    if (!own || !subscribePings) {
      return;
    }
    return subscribePings(hear);
  }, [subscribePings, own]);
  return notices;
}

type SubscribePings = (listener: (ping: TablePing) => void) => () => void;

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
  return (
    <Surface
      padding="sm"
      interactive
      className={clsx(styles.toast, TURN_KINDS.has(notice.kind) && styles.turn)}
      renderRoot={(props) => <button type="button" {...props} disabled={held} onClick={() => onOpen(notice)} />}
    >
      {notice.from && <FactionTokenFace token={notice.from} size={28} aria-hidden />}
      <NoticeWords notice={notice} />
      <Icon size={16} aria-hidden className={styles.icon} />
    </Surface>
  );
}

/* A notice's line, with a chat message's words quieter under it, up to two lines. */
function NoticeWords({ notice }: Readonly<{ notice: SoftNotice }>) {
  if (!notice.quote) {
    return (
      <Text size="sm" className={styles.line}>
        {notice.text}
      </Text>
    );
  }
  return (
    <div className={styles.line}>
      <Text size="sm">{notice.text}</Text>
      <Text size="xs" lineClamp={2} className={styles.quote}>
        {notice.quote}
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
  subscribePings,
  lookAt,
  showMapView,
}: Readonly<{
  table: TableProjection;
  start: NoticeStart | null;
  /** Each chat message another faction writes to the viewer, as it arrives. */
  subscribeMessages?: SubscribeMessages;
  /** Each ping at the table, as it lands. */
  subscribePings?: SubscribePings;
  /** Has the table's camera look at a spot, for a notice about one. */
  lookAt?: (spot: Vector3Tuple) => void;
  /** Whether a board gesture holds the pointer, when no notice may be opened. */
  inert: boolean;
  openPanel: (key: string) => void;
  openBattlePlan: (() => void) | null;
  /** Returns the camera to the Map view. */
  showMapView?: () => void;
}>) {
  const shipStyle = useContext(ShipToastStyleContext);
  const open = (notice: SoftNotice) => {
    const panel = notice.opens ?? PANELS[notice.kind];
    if (notice.kind === 'ship') {
      const reserves = start?.own && shipStyle === 'reserves' ? reservesSpot(table, start.own) : undefined;
      if (reserves) {
        lookAt?.(reserves);
      } else if (shipStyle === 'map') {
        showMapView?.();
      }
    } else if (notice.spot) {
      lookAt?.(notice.spot);
    } else if (panel) {
      openPanel(panel);
    } else if (notice.kind === 'battle') {
      openBattlePlan?.();
    }
  };
  const fromTable = useSoftNotices(table, start);
  const fromChat = useChatMessageNotices(table, subscribeMessages, start?.own);
  const fromPings = usePingNotices(table, subscribePings, start?.own);
  const notices =
    fromChat.length || fromPings.length
      ? [...fromTable, ...fromChat, ...fromPings].toSorted((a, b) => a.at - b.at)
      : fromTable;
  return <SoftNotices notices={notices} inert={inert} onOpen={open} />;
}
