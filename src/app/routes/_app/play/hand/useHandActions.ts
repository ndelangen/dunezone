import { factionTokenOf, factionTokenRingAngle } from '@shared/play/factionToken';
import { hiddenZoneView, nextHiddenZoneSpot } from '@shared/play/hiddenZone';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { PLAYER_RING_RADIUS } from '@shared/play/tableSettings';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { handGroups } from './handGroups';

type Outgoing = Readonly<{ where: 'table' | 'side'; commandId?: string }>;

export type HandProps = Readonly<{ client: TableSession; table: TableProjection; hand: TablePiece[] }>;

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
 * What the hand offers: its pieces sorted for reading, and each piece's actions from its right-click menu, which animate the piece out before their command goes.
 */
export function useHandActions({ client, table, hand }: HandProps) {
  const motion = useMotionAllowed();
  /* The pieces on their way out, and once sent, the command that takes them; a piece shows gone until the room refuses it. */
  const [outgoing, setOutgoing] = useState<ReadonlyMap<string, Outgoing>>(new Map());
  /* The pieces animating out, whose commands wait; unmounting sends them at once rather than dropping them. */
  const pending = useRef(new Map<number, () => unknown>());
  useEffect(
    () => () => {
      for (const [timer, send] of pending.current) {
        window.clearTimeout(timer);
        send();
      }
      pending.current.clear();
    },
    []
  );
  const factionId = table.snapshot.bank?.factionId ?? hand[0]?.owner ?? undefined;
  const inHand = hand.filter((piece) => !piece.hiddenZone);
  const enabled = table.canHandleTable;

  /*
   * A piece first animates out of the hand, then its command goes, and it stays out while the room has not answered;
   * the room's hand then drops it, or a refusal brings it back. Without motion its command goes at once.
   */
  const leave = (piece: TablePiece, where: Outgoing['where'], send: () => string | undefined) => {
    if (!motion) {
      send();
      return;
    }
    setOutgoing((current) => new Map(current).set(piece.id, { where }));
    const timer = window.setTimeout(() => {
      pending.current.delete(timer);
      const commandId = send();
      setOutgoing((current) => {
        const next = new Map(current);
        if (commandId) {
          next.set(piece.id, { where, commandId });
        } else {
          next.delete(piece.id);
        }
        return next;
      });
    }, LEAVE_MS);
    pending.current.set(timer, send);
  };
  const leaving = (piece: TablePiece) => {
    const entry = outgoing.get(piece.id);
    return entry && (!entry.commandId || client.awaiting(entry.commandId)) ? entry.where : undefined;
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

  return {
    enabled,
    inHand,
    groups: handGroups(inHand),
    leaving,
    playReason,
    playInFront,
    toSideTable,
  };
}

export type HandActions = ReturnType<typeof useHandActions>;

/** The native drag a piece starts, which the table's drop reads to play it face down where it lands. */
export function dragFromHand(piece: TablePiece) {
  return (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData('application/dune-hand', piece.id);
    const target = event.currentTarget;
    event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
  };
}
