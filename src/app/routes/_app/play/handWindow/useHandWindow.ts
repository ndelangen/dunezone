import { isBattleLeader } from '@shared/play/battle';
import { factionTokenOf, factionTokenRingAngle } from '@shared/play/factionToken';
import { hiddenZoneView, nextHiddenZoneSpot } from '@shared/play/hiddenZone';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { PLAYER_RING_RADIUS } from '@shared/play/tableSettings';
import { createContext, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';

/** The prototypes of the Hand & spice window a story can choose; without one the window shows the current content. */
export type HandWindowVariant = 'shelves' | 'fan' | 'ledger' | 'battle';

export const HandWindowVariantContext = createContext<HandWindowVariant | null>(null);

export type HandWindowProps = Readonly<{ client: TableSession; table: TableProjection; hand: TablePiece[] }>;

/** How a hand sorts its pieces for reading: leaders, then each card back by the word printed on it, then everything else. */
export type HandGroup = Readonly<{ key: string; label: string; pieces: TablePiece[] }>;

export function handGroups(pieces: readonly TablePiece[]): HandGroup[] {
  const groups = new Map<string, { label: string; pieces: TablePiece[] }>();
  const add = (key: string, label: string, piece: TablePiece) => {
    const group = groups.get(key) ?? { label, pieces: [] };
    group.pieces.push(piece);
    groups.set(key, group);
  };
  for (const piece of pieces) {
    if (isBattleLeader(piece)) {
      add('leaders', 'Leaders', piece);
    } else if (piece.kind === 'card') {
      const back = piece.items[0]?.artwork?.backName ?? 'Cards';
      add(`card:${back}`, back, piece);
    } else {
      add('other', 'Tokens', piece);
    }
  }
  const order = (key: string) => (key === 'leaders' ? 0 : key === 'other' ? 2 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([key, group]) => ({ key, ...group }));
}

/** The table point just outside the viewer's faction token, where a piece played "in front of me" goes; the room finds the clear spot. */
function frontOf(table: TableProjection, factionId: string | undefined): Vector3Tuple | null {
  const token = factionId ? factionTokenOf(table.snapshot.table.pieces, factionId) : undefined;
  if (!token) {
    return null;
  }
  const angle = factionTokenRingAngle(token.position);
  const reach = PLAYER_RING_RADIUS + 0.85;
  return [Math.cos(angle) * reach, 0.18, Math.sin(angle) * reach];
}

/* How long a piece takes to leave the hand before its command goes, so the eye follows where it went. */
const LEAVE_MS = 190;

/**
 * Everything the Hand & spice prototypes do, in one place: what is in the hand, the battle plan it can feed, and each one-click action on a piece or on the spice reserve.
 */
export function useHandWindow({ client, table, hand }: HandWindowProps) {
  const motion = useMotionAllowed();
  const [leaving, setLeaving] = useState<ReadonlyMap<string, 'table' | 'side'>>(new Map());
  const [withdrawn, setWithdrawn] = useState<{ amount: number; key: number } | null>(null);
  const withdrawals = useRef(0);
  const { battle, battlePlan: plan, bank } = table.snapshot;
  const factionId = bank?.factionId ?? hand[0]?.owner ?? undefined;
  const inHand = hand.filter((piece) => !piece.hiddenZone);
  const sideTable = hand.filter((piece) => piece.hiddenZone);
  const enabled = table.canHandleTable;

  const side = battle && plan ? battle.sides.find((entry) => entry?.factionId === factionId) : undefined;
  const planOpen = Boolean(enabled && plan && battle && side && !side.ready && battle.stage === 'preparing');
  /* The plan's pieces may have left the hand while committed, so the window shows them beside the hand. */
  const planPieces = plan
    ? [...inHand, ...plan.pieces].filter(
        (piece, index, all) => all.findIndex((candidate) => candidate.id === piece.id) === index
      )
    : inHand;
  const inPlan = (piece: TablePiece) =>
    Boolean(plan && (plan.leaderId === piece.id || plan.cardIds.includes(piece.id)));
  const planReason = (piece: TablePiece): string | undefined => {
    if (!plan || !battle) {
      return 'There is no battle plan to add to.';
    }
    if (!planOpen) {
      return side?.ready ? 'Undo Ready in the battle to change your plan.' : 'Your plan is locked.';
    }
    if (isBattleLeader(piece) ? plan.disclosed.leader : plan.disclosed.cardIds.includes(piece.id)) {
      return 'Shown to everyone, so it stays in the plan.';
    }
    if (!isBattleLeader(piece) && piece.kind !== 'card') {
      return 'Only leaders and cards go in a battle plan.';
    }
    return undefined;
  };
  const togglePlan = (piece: TablePiece) => {
    if (!plan || planReason(piece)) {
      return;
    }
    if (isBattleLeader(piece)) {
      client.editBattlePlan({ leaderId: plan.leaderId === piece.id ? null : piece.id });
    } else {
      client.editBattlePlan({
        cardIds: plan.cardIds.includes(piece.id)
          ? plan.cardIds.filter((id) => id !== piece.id)
          : [...plan.cardIds, piece.id],
      });
    }
  };

  /* A piece first animates out of the hand, then its command goes; without motion it goes at once. */
  const leave = (piece: TablePiece, where: 'table' | 'side', send: () => void) => {
    if (!motion) {
      send();
      return;
    }
    setLeaving((current) => new Map(current).set(piece.id, where));
    window.setTimeout(() => {
      send();
      setLeaving((current) => {
        const next = new Map(current);
        next.delete(piece.id);
        return next;
      });
    }, LEAVE_MS);
  };
  const front = frontOf(table, factionId);
  const playReason = !enabled
    ? 'You cannot handle the table right now.'
    : front
      ? undefined
      : 'Your faction token is not on the table.';
  const playInFront = (piece: TablePiece) => {
    if (!front || playReason) {
      return;
    }
    leave(piece, 'table', () => client.command({ kind: 'hand-play', pieceId: piece.id, position: front }));
  };
  const toSideTable = (piece: TablePiece, viewWidth?: number) => {
    if (!enabled) {
      return;
    }
    leave(piece, 'side', () =>
      client.command({
        kind: 'hand-zone',
        pieceId: piece.id,
        at: nextHiddenZoneSpot(hand, viewWidth ? hiddenZoneView(viewWidth, Infinity).extent : undefined),
      })
    );
  };

  const balance = bank?.balance ?? 0;
  const committed = plan?.spice ?? 0;
  const withdraw = (amount: number) => {
    if (!enabled || !bank || amount < 1 || amount > balance) {
      return;
    }
    client.command({ kind: 'bank-withdraw', amount });
    withdrawals.current += 1;
    setWithdrawn({ amount, key: withdrawals.current });
  };
  return {
    enabled,
    inHand,
    sideTable,
    groups: handGroups(inHand),
    leaving,
    plan,
    battle,
    planOpen,
    planPieces,
    inPlan,
    planReason,
    togglePlan,
    playReason,
    playInFront,
    toSideTable,
    bank,
    balance,
    committed,
    withdraw,
    withdrawn,
  };
}

export type HandWindowModel = ReturnType<typeof useHandWindow>;

/** The native drag a piece starts, which the table's drop reads to play it face down where it lands. */
export function dragFromHand(piece: TablePiece) {
  return (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData('application/dune-hand', piece.id);
    const target = event.currentTarget;
    event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
  };
}
