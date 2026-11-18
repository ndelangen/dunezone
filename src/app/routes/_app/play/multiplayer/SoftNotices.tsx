import { Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { GameSnapshot } from '@shared/play/protocol';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { Coins, Gavel, Handshake, Sailboat, Swords } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import { ownStep } from '../../../../db/tabletop/OwnChanges';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
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
}>;

const ICONS: Record<SoftNoticeKind, LucideIcon> = {
  bid: Gavel,
  ship: Sailboat,
  battle: Swords,
  spice: Coins,
  alliance: Handshake,
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
      <Text size="sm" className={styles.line}>
        {notice.text}
      </Text>
      <Icon size={16} aria-hidden className={styles.icon} />
    </Surface>
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
}: Readonly<{
  table: TableProjection;
  start: NoticeStart | null;
  /** Whether a board gesture holds the pointer, when no notice may be opened. */
  inert: boolean;
  openPanel: (key: string) => void;
  openBattlePlan: (() => void) | null;
}>) {
  const open = (notice: SoftNotice) => {
    const panel = PANELS[notice.kind];
    if (panel) {
      openPanel(panel);
    } else if (notice.kind === 'battle') {
      openBattlePlan?.();
    }
  };
  return <SoftNotices notices={useSoftNotices(table, start)} inert={inert} onOpen={open} />;
}
