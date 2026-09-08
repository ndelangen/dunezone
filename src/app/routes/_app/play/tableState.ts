import { gestureBlockReason, nearestZone, pieceCount, viewerCanControl, zoneById } from './model';
import type { DraftMove, TableEvent, TableItem, TablePiece, TableState, Vector3Tuple } from './model';
import { moveStormCounterclockwise } from './stormSector';
import { placementAnchorAtPosition } from './tableFurnitureLayout';
import { restingPositionAt, stackPreviewPositionFor } from './tableGeometry';
import {
  clampPositionToTable,
  isOverlapFreePosition,
  nearestCollisionFreePosition,
  piecesCanStack,
  piecesTouchForStack,
} from './tablePhysics';

export function eventId(number: number): string {
  return `evt-${String(number).padStart(3, '0')}`;
}

export function ownerLabel(piece: TablePiece): string {
  if (piece.owner === 'bene-gesserit') {
    return 'Bene Gesserit';
  }
  return piece.owner.charAt(0).toUpperCase() + piece.owner.slice(1);
}

export function labelForCount(piece: TablePiece, count: number, held = false): string {
  if (piece.kind === 'card') {
    if (count === 1) {
      return 'Treachery card';
    }
    return held ? 'Treachery cards' : 'Treachery deck';
  }
  if (piece.kind === 'force') {
    return count === 1 ? `${ownerLabel(piece)} force` : `${ownerLabel(piece)} forces`;
  }
  return piece.label;
}

function withdrawnIdsFor(draft: DraftMove, sourcePieceId: string): Set<string> {
  return new Set(
    draft.withdrawals
      .filter((withdrawal) => withdrawal.sourcePieceId === sourcePieceId)
      .map((withdrawal) => withdrawal.itemId)
  );
}

function remainingItemsFor(piece: TablePiece, draft: DraftMove): TableItem[] {
  const withdrawnIds = withdrawnIdsFor(draft, piece.id);
  return withdrawnIds.size ? piece.items.filter((item) => !withdrawnIds.has(item.id)) : piece.items;
}

function hasExactItemOrder(piece: TablePiece, itemIds: string[]): boolean {
  return piece.items.length === itemIds.length && piece.items.every((item, index) => item.id === itemIds[index]);
}

export function heldPieceFor(state: TableState, draft: DraftMove): TablePiece | null {
  const canonicalHeld = state.pieces.find((piece) => piece.id === draft.pieceId);
  if (
    canonicalHeld &&
    (canonicalHeld.id !== draft.sourcePieceId || !hasExactItemOrder(canonicalHeld, draft.pickedUpItemIds))
  ) {
    return null;
  }
  if (draft.withdrawals.length === 0) {
    return canonicalHeld
      ? {
          ...canonicalHeld,
          position: [...draft.position],
          orientation: draft.orientation,
        }
      : null;
  }
  const source = state.pieces.find((piece) => piece.id === draft.sourcePieceId);
  if (!source) {
    return null;
  }
  if (!canonicalHeld) {
    const initiallyWithdrawnIds = draft.withdrawals
      .slice(0, draft.pickedUpItemIds.length)
      .map((withdrawal) => withdrawal.itemId);
    if (
      initiallyWithdrawnIds.length !== draft.pickedUpItemIds.length ||
      initiallyWithdrawnIds.some((itemId, index) => itemId !== draft.pickedUpItemIds[index])
    ) {
      return null;
    }
  }
  const withdrawnItems = [...draft.withdrawals].reverse().flatMap((withdrawal) => {
    const withdrawalSource = state.pieces.find((piece) => piece.id === withdrawal.sourcePieceId);
    const item = withdrawalSource?.items.find((candidate) => candidate.id === withdrawal.itemId);
    return item ? [item] : [];
  });
  if (withdrawnItems.length !== draft.withdrawals.length) {
    return null;
  }
  const baseItems = canonicalHeld ? remainingItemsFor(canonicalHeld, draft) : [];
  const items = [...withdrawnItems, ...baseItems];
  return {
    ...source,
    id: draft.pieceId,
    label: labelForCount(source, items.length, true),
    items,
    position: [...draft.position],
    orientation: draft.orientation,
    zoneId: source.zoneId,
    locked: source.locked,
  };
}

export function renderedPiecesFor(state: TableState): TablePiece[] {
  const draft = state.draftMove;
  if (!draft || draft.withdrawals.length === 0) {
    return state.pieces;
  }
  const heldPiece = heldPieceFor(state, draft);
  if (!heldPiece) {
    return state.pieces;
  }
  const canonicalHeld = state.pieces.some((piece) => piece.id === draft.pieceId);
  const remainingPieces = state.pieces.flatMap((piece) => {
    if (canonicalHeld && piece.id === draft.pieceId) {
      return [heldPiece];
    }
    const items = remainingItemsFor(piece, draft);
    if (items.length) {
      return [{ ...piece, label: labelForCount(piece, items.length), items }];
    }
    if (piece.id !== draft.pieceId && withdrawnIdsFor(draft, piece.id).size) {
      return [{ ...piece, items: [] }];
    }
    return [];
  });
  return canonicalHeld ? remainingPieces : [...remainingPieces, heldPiece];
}

export function rejection(state: TableState, command: string, message: string): TableState {
  const event: TableEvent = {
    id: eventId(state.nextEventNumber),
    command,
    message,
    status: 'rejected',
  };
  return {
    ...state,
    events: [event, ...state.events].slice(0, 8),
    nextEventNumber: state.nextEventNumber + 1,
  };
}

export function moveConstraintMessage(
  state: TableState,
  piece: TablePiece,
  targetZoneId: string | null
): string | null {
  if (!viewerCanControl(state, piece)) {
    return `Another seat controls ${piece.label}.`;
  }
  if (targetZoneId !== null && targetZoneId === piece.zoneId) {
    return null;
  }
  if (
    state.phase === 'Harkonnen shipment' &&
    piece.owner === 'harkonnen' &&
    piece.kind === 'force' &&
    targetZoneId !== 'arrakeen'
  ) {
    return 'The current shipment only permits Harkonnen forces to Arrakeen.';
  }
  return null;
}

export function assistedMoveWarning(state: TableState, piece: TablePiece, targetZoneId: string | null): string | null {
  if (state.enforcement !== 'assisted') {
    return null;
  }
  const message = moveConstraintMessage(state, piece, targetZoneId);
  return message ? `${message} Committing records an assisted-play override.` : null;
}

export function assistedControlWarning(state: TableState, piece: TablePiece): string | null {
  if (state.enforcement !== 'assisted' || viewerCanControl(state, piece)) {
    return null;
  }
  return `Another seat controls ${piece.label}. This action records an assisted-play override.`;
}

export function assistedStackWarning(state: TableState, source: TablePiece, target: TablePiece): string | null {
  const moveWarning = assistedMoveWarning(state, source, target.zoneId);
  if (moveWarning) {
    return moveWarning;
  }
  if (state.enforcement === 'assisted' && !viewerCanControl(state, target)) {
    return `Another seat controls ${target.label}. Committing records an assisted-play override.`;
  }
  return null;
}

export function compatibleStackTarget(
  state: TableState,
  source: TablePiece,
  position: Vector3Tuple,
  draft: DraftMove | null = null,
  includeNearby = false
): TablePiece | null {
  if (!source.stackKey) {
    return null;
  }

  let closest: { piece: TablePiece; distance: number } | null = null;
  const nearbyRange = source.kind === 'card' ? 1.3 : 0.575;
  for (const candidate of state.pieces) {
    const remainingItems = draft ? remainingItemsFor(candidate, draft) : candidate.items;
    const liveCandidate = { ...candidate, items: remainingItems };
    const distance = Math.hypot(position[0] - candidate.position[0], position[2] - candidate.position[2]);
    if (
      candidate.id === source.id ||
      candidate.locked ||
      remainingItems.length === 0 ||
      (state.enforcement === 'strict' && !viewerCanControl(state, candidate)) ||
      !piecesCanStack(source, liveCandidate) ||
      (!piecesTouchForStack(source, position, liveCandidate) && !(includeNearby && distance <= nearbyRange))
    ) {
      continue;
    }
    if (!closest || distance < closest.distance) {
      closest = { piece: liveCandidate, distance };
    }
  }
  return closest?.piece ?? null;
}

function placementObstaclesFor(state: TableState, draft: DraftMove): TablePiece[] {
  return renderedPiecesFor({ ...state, draftMove: draft }).filter(
    (piece) => piece.id !== draft.pieceId && pieceCount(piece) > 0
  );
}

export function projectCarryAtPosition(state: TableState, draft: DraftMove, position: Vector3Tuple): DraftMove | null {
  const piece = heldPieceFor(state, draft);
  if (!piece) {
    return null;
  }
  const placementAnchor = placementAnchorAtPosition(piece, position);
  const projectedPiece = placementAnchor ? { ...piece, orientation: placementAnchor.orientation } : piece;
  const targetPosition = placementAnchor?.position ?? position;
  const targetPiece = compatibleStackTarget(state, projectedPiece, targetPosition, draft);
  if (targetPiece) {
    return {
      ...draft,
      operation: 'merge',
      position: [...position],
      targetZoneId: targetPiece.zoneId,
      targetPieceId: targetPiece.id,
      warning: assistedStackWarning(state, projectedPiece, targetPiece),
    };
  }
  if (placementAnchor) {
    return {
      ...draft,
      operation: 'move',
      position: [placementAnchor.position[0], position[1], placementAnchor.position[2]],
      targetZoneId: null,
      targetPieceId: null,
      warning: assistedMoveWarning(state, projectedPiece, null),
    };
  }
  const targetZoneId = nearestZone(position)?.id ?? null;
  return {
    ...draft,
    operation: 'move',
    position: [...position],
    targetZoneId,
    targetPieceId: null,
    warning: assistedMoveWarning(state, piece, targetZoneId),
  };
}

function settleMoveAtPosition(
  state: TableState,
  draft: DraftMove,
  piece: TablePiece,
  position: Vector3Tuple
): DraftMove | null {
  const placementAnchor = placementAnchorAtPosition(piece, position);
  if (placementAnchor) {
    const anchoredPiece = {
      ...piece,
      orientation: placementAnchor.orientation,
    };
    const anchoredPosition = restingPositionAt(placementAnchor.position, anchoredPiece);
    if (!isOverlapFreePosition(anchoredPiece, anchoredPosition, placementObstaclesFor(state, draft))) {
      return null;
    }
    return {
      ...draft,
      operation: 'move',
      position: anchoredPosition,
      orientation: placementAnchor.orientation,
      targetZoneId: null,
      targetPieceId: null,
      warning: assistedMoveWarning(state, anchoredPiece, null),
    };
  }
  const clampedPosition = clampPositionToTable(piece, restingPositionAt(position, piece));
  const resolvedPosition = nearestCollisionFreePosition(piece, clampedPosition, placementObstaclesFor(state, draft));
  if (!resolvedPosition) {
    return null;
  }
  const restingPosition = restingPositionAt(resolvedPosition, piece);
  const targetZoneId = nearestZone(restingPosition)?.id ?? null;
  return {
    ...draft,
    operation: 'move',
    position: restingPosition,
    targetZoneId,
    targetPieceId: null,
    warning: assistedMoveWarning(state, piece, targetZoneId),
  };
}

export function settleCarryAtPosition(state: TableState, draft: DraftMove, position: Vector3Tuple): DraftMove | null {
  const projected = projectCarryAtPosition(state, draft, position);
  if (!projected) {
    return null;
  }
  const piece = heldPieceFor(state, projected);
  if (!piece) {
    return null;
  }
  if (projected.operation === 'merge' && projected.targetPieceId) {
    const target = state.pieces.find((candidate) => candidate.id === projected.targetPieceId);
    if (!target) {
      return null;
    }
    const targetItems = remainingItemsFor(target, projected);
    return {
      ...projected,
      position: stackPreviewPositionFor({ ...target, items: targetItems }),
    };
  }
  return settleMoveAtPosition(state, projected, piece, position);
}

export function appendEvent(state: TableState, event: TableEvent): Pick<TableState, 'events' | 'nextEventNumber'> {
  return {
    events: [event, ...state.events].slice(0, 8),
    nextEventNumber: state.nextEventNumber + 1,
  };
}

export function flipPieceInState(state: TableState, pieceId?: string): TableState {
  if (state.draftMove) {
    return rejection(state, 'piece.flip', 'Finish or cancel the current move before flipping.');
  }
  const selectedId = pieceId ?? state.selectedPieceId;
  const piece = state.pieces.find((candidate) => candidate.id === selectedId);
  if (!piece || pieceCount(piece) === 0 || (piece.kind !== 'card' && piece.kind !== 'force')) {
    return state;
  }
  const blockedReason = gestureBlockReason(state, piece);
  if (blockedReason) {
    return rejection(state, 'piece.flip', blockedReason);
  }
  const warning = assistedControlWarning(state, piece);
  const items = [...piece.items].reverse().map((item) => ({ ...item, faceUp: !item.faceUp }));
  const event: TableEvent = {
    id: eventId(state.nextEventNumber),
    command: 'piece.flip',
    message: `${piece.label} flipped ${items.at(-1)?.faceUp ? 'face up' : 'face down'}.`,
    status: warning ? 'accepted-with-warning' : 'accepted',
  };
  return {
    ...state,
    selectedPieceId: piece.id,
    pieces: state.pieces.map((candidate) =>
      candidate.id === piece.id ? { ...piece, items, flipRevision: (piece.flipRevision ?? 0) + 1 } : candidate
    ),
    ...appendEvent(state, event),
  };
}

/* Animation locks belong to this view, not to the canonical game record. */
export type TabletopViewState = {
  table: TableState;
  flippingPieceIds: ReadonlyMap<string, number>;
};

export function requestPieceFlip(current: TabletopViewState, pieceId?: string): TabletopViewState {
  const targetId = pieceId ?? current.table.selectedPieceId;
  if (!targetId || current.flippingPieceIds.has(targetId)) {
    return current;
  }
  const table = flipPieceInState(current.table, targetId);
  if (table === current.table) {
    return current;
  }
  const before = current.table.pieces.find((piece) => piece.id === targetId);
  const after = table.pieces.find((piece) => piece.id === targetId);
  if (!after || after.flipRevision === before?.flipRevision) {
    return { ...current, table };
  }
  const flippingPieceIds = new Map(current.flippingPieceIds);
  flippingPieceIds.set(targetId, after.flipRevision ?? 0);
  return { table, flippingPieceIds };
}

export function finishPieceFlipInView(
  current: TabletopViewState,
  pieceId: string,
  revision: number
): TabletopViewState {
  if (current.flippingPieceIds.get(pieceId) !== revision) {
    return current;
  }
  const flippingPieceIds = new Map(current.flippingPieceIds);
  flippingPieceIds.delete(pieceId);
  return { ...current, flippingPieceIds };
}

export function moveStormInState(state: TableState, direction: -1 | 1 = 1): TableState {
  if (direction !== -1 && direction !== 1) {
    return state;
  }
  const stormSectorIndex = moveStormCounterclockwise(state.stormSectorIndex, direction);
  const event: TableEvent = {
    id: eventId(state.nextEventNumber),
    command: 'storm.move',
    message:
      direction > 0
        ? `Storm advanced to sector ${stormSectorIndex + 1}.`
        : `Storm moved back to sector ${stormSectorIndex + 1}.`,
    status: 'accepted',
  };
  return {
    ...state,
    stormSectorIndex,
    ...appendEvent(state, event),
  };
}

function withdrawalConstraintMessage(state: TableState, draft: DraftMove): string | null {
  const seenItemIds = new Set<string>();
  const projectedItems = new Map(state.pieces.map((piece) => [piece.id, [...piece.items]]));
  for (const withdrawal of draft.withdrawals) {
    if (seenItemIds.has(withdrawal.itemId)) {
      return 'The held group contains the same item twice.';
    }
    seenItemIds.add(withdrawal.itemId);
    const source = state.pieces.find((piece) => piece.id === withdrawal.sourcePieceId);
    const sourceItems = projectedItems.get(withdrawal.sourcePieceId);
    if (!source || !sourceItems?.some((item) => item.id === withdrawal.itemId)) {
      return 'One of the held items is no longer available.';
    }
    if (source.locked) {
      return `${source.label} is locked.`;
    }
    if (state.enforcement === 'strict' && !viewerCanControl(state, source)) {
      return `Another seat controls ${source.label}.`;
    }
    if (sourceItems.at(-1)?.id !== withdrawal.itemId) {
      return `The top of ${source.label} changed while the group was held.`;
    }
    sourceItems.pop();
  }
  return null;
}

function withdrawalMoveConstraintMessage(state: TableState, draft: DraftMove): string | null {
  const sourceIds = new Set(draft.withdrawals.map((withdrawal) => withdrawal.sourcePieceId));
  for (const sourceId of sourceIds) {
    const source = state.pieces.find((piece) => piece.id === sourceId);
    if (!source) {
      return 'One of the held stacks is no longer available.';
    }
    const message = moveConstraintMessage(state, source, draft.targetZoneId);
    if (message) {
      return message;
    }
  }
  return null;
}

function assistedWithdrawalWarning(state: TableState, draft: DraftMove): string | null {
  if (state.enforcement !== 'assisted') {
    return null;
  }
  const message = withdrawalMoveConstraintMessage(state, draft);
  return message ? `${message} Committing records an assisted-play override.` : null;
}

function piecesWithoutWithdrawals(state: TableState, draft: DraftMove): TablePiece[] {
  return state.pieces.flatMap((piece) => {
    const items = remainingItemsFor(piece, draft);
    return items.length ? [{ ...piece, label: labelForCount(piece, items.length), items }] : [];
  });
}

export function applyDraftToState(current: TableState, requestedDraft: DraftMove): TableState {
  const rejectedBase: TableState = {
    ...current,
    selectedPieceId: requestedDraft.sourcePieceId,
    draftMove: null,
  };
  let draft = requestedDraft;
  let piece = heldPieceFor(current, draft);
  if (!piece) {
    return rejection(rejectedBase, 'piece.move', 'The held object is no longer available.');
  }
  if (piece.locked) {
    return rejection(rejectedBase, 'piece.move', `${piece.label} is locked.`);
  }
  const withdrawalConstraint = withdrawalConstraintMessage(current, draft);
  if (withdrawalConstraint) {
    return rejection(rejectedBase, 'stack.take', withdrawalConstraint);
  }
  if (draft.operation === 'move') {
    const resolvedDraft = settleMoveAtPosition(current, draft, piece, draft.position);
    if (!resolvedDraft) {
      return rejection(rejectedBase, 'piece.move', 'There is no clear space for that object.');
    }
    draft = resolvedDraft;
    piece = heldPieceFor(current, draft);
    if (!piece) {
      return rejection(rejectedBase, 'piece.move', 'The held object is no longer available.');
    }
  }
  const moveConstraint = moveConstraintMessage(current, piece, draft.targetZoneId);
  const withdrawalMoveConstraint = withdrawalMoveConstraintMessage(current, draft);
  if (current.enforcement === 'strict' && (moveConstraint || withdrawalMoveConstraint)) {
    return rejection(
      rejectedBase,
      'piece.move',
      moveConstraint ?? withdrawalMoveConstraint ?? 'That move is not permitted.'
    );
  }

  const targetZone = zoneById(draft.targetZoneId);
  const isShipment =
    current.phase === 'Harkonnen shipment' &&
    piece.owner === 'harkonnen' &&
    piece.kind === 'force' &&
    draft.targetZoneId === 'arrakeen' &&
    piece.zoneId !== 'arrakeen';

  if (draft.operation === 'merge' && draft.targetPieceId) {
    const target = current.pieces.find((candidate) => candidate.id === draft.targetPieceId);
    const targetItems = target ? remainingItemsFor(target, draft) : [];
    const liveTarget = target ? { ...target, items: targetItems } : null;
    const targetShift = target
      ? Math.hypot(draft.position[0] - target.position[0], draft.position[2] - target.position[2])
      : Number.POSITIVE_INFINITY;
    if (
      !target ||
      !liveTarget ||
      target.locked ||
      targetItems.length === 0 ||
      !piecesCanStack(piece, liveTarget) ||
      target.zoneId !== draft.targetZoneId ||
      targetShift > 0.001 ||
      !piecesTouchForStack(piece, draft.position, liveTarget)
    ) {
      return rejection(rejectedBase, 'stack.merge', 'That stack target moved or is no longer available.');
    }
    if (current.enforcement === 'strict' && !viewerCanControl(current, target)) {
      return rejection(rejectedBase, 'stack.merge', `Another seat controls ${target.label}.`);
    }

    const liveTargetDraft = { ...draft, targetZoneId: target.zoneId };
    const liveMoveConstraint = moveConstraintMessage(current, piece, target.zoneId);
    const liveWithdrawalConstraint = withdrawalMoveConstraintMessage(current, liveTargetDraft);
    if (current.enforcement === 'strict' && (liveMoveConstraint || liveWithdrawalConstraint)) {
      return rejection(
        rejectedBase,
        'stack.merge',
        liveMoveConstraint ?? liveWithdrawalConstraint ?? 'That merge is not permitted.'
      );
    }

    const warning = assistedStackWarning(current, piece, target) ?? assistedWithdrawalWarning(current, liveTargetDraft);
    const basePieces = draft.withdrawals.length
      ? piecesWithoutWithdrawals(current, draft).filter((candidate) => candidate.id !== piece.id)
      : current.pieces.filter((candidate) => candidate.id !== piece.id);
    const baseTarget = basePieces.find((candidate) => candidate.id === target.id);
    if (!baseTarget) {
      return rejection(rejectedBase, 'stack.merge', 'That stack target has no items left.');
    }
    const combinedItems = [...baseTarget.items, ...piece.items];
    const event: TableEvent = {
      id: eventId(current.nextEventNumber),
      command:
        current.phase === 'Harkonnen shipment' &&
        piece.owner === 'harkonnen' &&
        piece.kind === 'force' &&
        target.zoneId === 'arrakeen' &&
        piece.zoneId !== 'arrakeen'
          ? 'ship.forces'
          : 'stack.merge',
      message:
        piece.kind === 'card'
          ? `${pieceCount(piece)} ${pieceCount(piece) === 1 ? 'card' : 'cards'} placed on ${target.label}.`
          : `${pieceCount(piece)} ${pieceCount(piece) === 1 ? 'force' : 'forces'} stacked with ${target.label}.`,
      status: warning ? 'accepted-with-warning' : 'accepted',
    };
    return {
      ...current,
      pieces: basePieces.map((candidate) =>
        candidate.id === baseTarget.id
          ? {
              ...candidate,
              label: labelForCount(candidate, combinedItems.length),
              items: combinedItems,
            }
          : candidate
      ),
      selectedPieceId: baseTarget.id,
      draftMove: null,
      ...appendEvent(current, event),
    };
  }

  const warning = assistedMoveWarning(current, piece, draft.targetZoneId) ?? assistedWithdrawalWarning(current, draft);
  const source = current.pieces.find((candidate) => candidate.id === draft.sourcePieceId);
  const peeledFromStack = Boolean(source && draft.withdrawals.length && pieceCount(source) > 1);
  const command = isShipment
    ? 'ship.forces'
    : peeledFromStack
      ? piece.kind === 'card'
        ? 'deck.draw'
        : 'stack.split'
      : 'piece.move';
  const destination = targetZone?.label ?? 'a free table position';
  const event: TableEvent = {
    id: eventId(current.nextEventNumber),
    command,
    message: `${piece.label} moved to ${destination}.`,
    status: warning ? 'accepted-with-warning' : 'accepted',
  };
  const movedPiece: TablePiece = {
    ...piece,
    position: [...draft.position],
    orientation: draft.orientation,
    zoneId: draft.targetZoneId,
  };
  return {
    ...current,
    pieces: draft.withdrawals.length
      ? [...piecesWithoutWithdrawals(current, draft).filter((candidate) => candidate.id !== movedPiece.id), movedPiece]
      : current.pieces.map((candidate) => (candidate.id === piece.id ? movedPiece : candidate)),
    selectedPieceId: movedPiece.id,
    draftMove: null,
    ...appendEvent(current, event),
  };
}

export function draftWithAdditionalTop(state: TableState, draft: DraftMove): DraftMove | null {
  if (!draft.targetPieceId || !canTakeAdditionalFromDraft(state, draft)) {
    return null;
  }
  const heldPiece = heldPieceFor(state, draft);
  const target = state.pieces.find((piece) => piece.id === draft.targetPieceId);
  const liveTarget = heldPiece ? compatibleStackTarget(state, heldPiece, draft.position, draft) : null;
  if (
    !heldPiece ||
    !target ||
    liveTarget?.id !== target.id ||
    target.zoneId !== draft.targetZoneId ||
    target.locked ||
    !heldPiece.stackKey ||
    target.stackKey !== heldPiece.stackKey ||
    (state.enforcement === 'strict' && !viewerCanControl(state, target))
  ) {
    return null;
  }
  const topItem = remainingItemsFor(target, draft).at(-1);
  if (!topItem) {
    return null;
  }
  const nextDraft: DraftMove = {
    ...draft,
    withdrawals: [...draft.withdrawals, { sourcePieceId: target.id, itemId: topItem.id }],
  };
  return projectCarryAtPosition(state, nextDraft, draft.position) ?? nextDraft;
}

export function canTakeAdditionalFromDraft(state: TableState, draft: DraftMove): boolean {
  const heldPiece = heldPieceFor(state, draft);
  return (
    draft.pickedUpItemIds.length === 1 &&
    heldPiece !== null &&
    !heldPiece.locked &&
    withdrawalConstraintMessage(state, draft) === null &&
    (state.enforcement !== 'strict' || viewerCanControl(state, heldPiece))
  );
}

export function draftForGesture(piece: TablePiece, pickup: 'top' | 'whole'): DraftMove | null {
  const count = pieceCount(piece);
  if (count === 0) {
    return null;
  }
  /*
   * A singleton is already the whole physical object.
   * Withdrawing its only item would replace the captured mesh during the drag.
   */
  const peelsItem = pickup === 'top' && count > 1;
  const topItem = piece.items.at(-1);
  if (peelsItem && !topItem) {
    return null;
  }
  const gesturePieceId = peelsItem ? `${piece.id}-held-${topItem?.id}` : piece.id;

  return {
    operation: 'move',
    pieceId: gesturePieceId,
    sourcePieceId: piece.id,
    pickedUpItemIds: peelsItem && topItem ? [topItem.id] : piece.items.map((item) => item.id),
    withdrawals: peelsItem && topItem ? [{ sourcePieceId: piece.id, itemId: topItem.id }] : [],
    origin: [...piece.position],
    originOrientation: piece.orientation,
    position: [...piece.position],
    orientation: piece.orientation,
    targetZoneId: piece.zoneId,
    targetPieceId: null,
    warning: null,
  };
}
