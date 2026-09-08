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

function canonicalHeldMatchesDraft(piece: TablePiece | undefined, draft: DraftMove): boolean {
  if (!piece) {
    return true;
  }
  return piece.id === draft.sourcePieceId && hasExactItemOrder(piece, draft.pickedUpItemIds);
}

function initialWithdrawalsMatchDraft(canonicalHeld: TablePiece | undefined, draft: DraftMove): boolean {
  if (canonicalHeld) {
    return true;
  }
  const itemIds = draft.withdrawals.slice(0, draft.pickedUpItemIds.length).map((withdrawal) => withdrawal.itemId);
  return (
    itemIds.length === draft.pickedUpItemIds.length && itemIds.every((id, index) => id === draft.pickedUpItemIds[index])
  );
}

function withdrawnItemsFor(state: TableState, draft: DraftMove): TableItem[] {
  return [...draft.withdrawals].reverse().flatMap((withdrawal) => {
    const source = state.pieces.find((piece) => piece.id === withdrawal.sourcePieceId);
    const item = source?.items.find((candidate) => candidate.id === withdrawal.itemId);
    return item ? [item] : [];
  });
}

function canonicalHeldAtPose(piece: TablePiece | undefined, draft: DraftMove): TablePiece | null {
  return piece ? { ...piece, position: [...draft.position], orientation: draft.orientation } : null;
}

export function heldPieceFor(state: TableState, draft: DraftMove): TablePiece | null {
  const canonicalHeld = state.pieces.find((piece) => piece.id === draft.pieceId);
  if (!canonicalHeldMatchesDraft(canonicalHeld, draft)) {
    return null;
  }
  if (draft.withdrawals.length === 0) {
    return canonicalHeldAtPose(canonicalHeld, draft);
  }
  const source = state.pieces.find((piece) => piece.id === draft.sourcePieceId);
  if (!source) {
    return null;
  }
  if (!initialWithdrawalsMatchDraft(canonicalHeld, draft)) {
    return null;
  }
  const withdrawnItems = withdrawnItemsFor(state, draft);
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

function remainingRenderedPiece(piece: TablePiece, draft: DraftMove, heldPiece: TablePiece): TablePiece[] {
  if (piece.id === draft.pieceId) {
    return [heldPiece];
  }
  const items = remainingItemsFor(piece, draft);
  if (items.length) {
    return [{ ...piece, label: labelForCount(piece, items.length), items }];
  }
  return withdrawnIdsFor(draft, piece.id).size ? [{ ...piece, items: [] }] : [];
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
  const remainingPieces = state.pieces.flatMap((piece) => remainingRenderedPiece(piece, draft, heldPiece));
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
  if (isHarkonnenShipmentForce(state, piece) && targetZoneId !== 'arrakeen') {
    return 'The current shipment only permits Harkonnen forces to Arrakeen.';
  }
  return null;
}

function isHarkonnenShipmentForce(state: TableState, piece: TablePiece): boolean {
  const isHarkonnenForce = piece.owner === 'harkonnen' && piece.kind === 'force';
  return state.phase === 'Harkonnen shipment' && isHarkonnenForce;
}

function isShipment(state: TableState, piece: TablePiece, targetZoneId: string | null): boolean {
  const entersArrakeen = targetZoneId === 'arrakeen' && piece.zoneId !== 'arrakeen';
  return isHarkonnenShipmentForce(state, piece) && entersArrakeen;
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

type StackTargetOptions = { draft?: DraftMove | null; includeNearby?: boolean };

function stackCandidateIsAvailable(state: TableState, source: TablePiece, candidate: TablePiece): boolean {
  if (candidate.id === source.id || candidate.locked) {
    return false;
  }
  if (state.enforcement === 'strict' && !viewerCanControl(state, candidate)) {
    return false;
  }
  return candidate.items.length > 0 && piecesCanStack(source, candidate);
}

function stackCandidateIsNear(
  source: TablePiece,
  position: Vector3Tuple,
  candidate: TablePiece,
  includeNearby: boolean
): boolean {
  if (piecesTouchForStack(source, position, candidate)) {
    return true;
  }
  const nearbyRange = source.kind === 'card' ? 1.3 : 0.575;
  const distance = Math.hypot(position[0] - candidate.position[0], position[2] - candidate.position[2]);
  return includeNearby && distance <= nearbyRange;
}

function availableStackCandidates(state: TableState, source: TablePiece, draft: DraftMove | null): TablePiece[] {
  return state.pieces
    .map((candidate) => ({
      ...candidate,
      items: draft ? remainingItemsFor(candidate, draft) : candidate.items,
    }))
    .filter((candidate) => stackCandidateIsAvailable(state, source, candidate));
}

export function compatibleStackTarget(
  state: TableState,
  source: TablePiece,
  position: Vector3Tuple,
  { draft = null, includeNearby = false }: StackTargetOptions = {}
): TablePiece | null {
  if (!source.stackKey) {
    return null;
  }

  let closest: { piece: TablePiece; distance: number } | null = null;
  for (const candidate of availableStackCandidates(state, source, draft)) {
    const distance = Math.hypot(position[0] - candidate.position[0], position[2] - candidate.position[2]);
    if (!stackCandidateIsNear(source, position, candidate, includeNearby)) {
      continue;
    }
    if (!closest || distance < closest.distance) {
      closest = { piece: candidate, distance };
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
  const targetPiece = compatibleStackTarget(state, projectedPiece, targetPosition, { draft });
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

function isFlippablePiece(piece: TablePiece | undefined): piece is TablePiece {
  if (!piece) {
    return false;
  }
  const canFlipKind = piece.kind === 'card' || piece.kind === 'force';
  return pieceCount(piece) > 0 && canFlipKind;
}

export function flipPieceInState(state: TableState, pieceId?: string): TableState {
  if (state.draftMove) {
    return rejection(state, 'piece.flip', 'Finish or cancel the current move before flipping.');
  }
  const selectedId = pieceId ?? state.selectedPieceId;
  const piece = state.pieces.find((candidate) => candidate.id === selectedId);
  if (!isFlippablePiece(piece)) {
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

function withdrawalSource(
  state: TableState,
  withdrawal: DraftMove['withdrawals'][number],
  projectedItems: Map<string, TableItem[]>
) {
  const source = state.pieces.find((piece) => piece.id === withdrawal.sourcePieceId);
  const items = projectedItems.get(withdrawal.sourcePieceId);
  if (!source || !items?.some((item) => item.id === withdrawal.itemId)) {
    return null;
  }
  return { source, items };
}

function withdrawalConstraintMessage(state: TableState, draft: DraftMove): string | null {
  const seenItemIds = new Set<string>();
  const projectedItems = new Map(state.pieces.map((piece) => [piece.id, [...piece.items]]));
  for (const withdrawal of draft.withdrawals) {
    if (seenItemIds.has(withdrawal.itemId)) {
      return 'The held group contains the same item twice.';
    }
    seenItemIds.add(withdrawal.itemId);
    const available = withdrawalSource(state, withdrawal, projectedItems);
    if (!available) {
      return 'One of the held items is no longer available.';
    }
    const blocked = gestureBlockReason(state, available.source);
    if (blocked) {
      return blocked;
    }
    if (available.items.at(-1)?.id !== withdrawal.itemId) {
      return `The top of ${available.source.label} changed while the group was held.`;
    }
    available.items.pop();
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

type DraftApplication = {
  current: TableState;
  rejectedBase: TableState;
  draft: DraftMove;
  piece: TablePiece;
};

type DraftResolution = DraftApplication | { rejected: TableState };

function rejectDraft(rejectedBase: TableState, command: string, message: string): DraftResolution {
  return { rejected: rejection(rejectedBase, command, message) };
}

function settleDraftApplication(application: DraftApplication): DraftResolution {
  const { current, draft, piece, rejectedBase } = application;
  const settled = settleMoveAtPosition(current, draft, piece, draft.position);
  if (!settled) {
    return rejectDraft(rejectedBase, 'piece.move', 'There is no clear space for that object.');
  }
  const held = heldPieceFor(current, settled);
  if (!held) {
    return rejectDraft(rejectedBase, 'piece.move', 'The held object is no longer available.');
  }
  return { ...application, draft: settled, piece: held };
}

function resolveDraftApplication(current: TableState, draft: DraftMove): DraftResolution {
  const rejectedBase = { ...current, selectedPieceId: draft.sourcePieceId, draftMove: null };
  const piece = heldPieceFor(current, draft);
  if (!piece) {
    return rejectDraft(rejectedBase, 'piece.move', 'The held object is no longer available.');
  }
  if (piece.locked) {
    return rejectDraft(rejectedBase, 'piece.move', `${piece.label} is locked.`);
  }
  const withdrawalConstraint = withdrawalConstraintMessage(current, draft);
  if (withdrawalConstraint) {
    return rejectDraft(rejectedBase, 'stack.take', withdrawalConstraint);
  }
  const application = { current, rejectedBase, draft, piece };
  return draft.operation === 'move' ? settleDraftApplication(application) : application;
}

function strictDraftConstraint(
  current: TableState,
  piece: TablePiece,
  draft: DraftMove,
  fallback: string
): string | null {
  if (current.enforcement !== 'strict') {
    return null;
  }
  const moveConstraint = moveConstraintMessage(current, piece, draft.targetZoneId);
  const withdrawalConstraint = withdrawalMoveConstraintMessage(current, draft);
  if (!moveConstraint && !withdrawalConstraint) {
    return null;
  }
  return moveConstraint ?? withdrawalConstraint ?? fallback;
}

function mergeTargetIsStable(piece: TablePiece, draft: DraftMove, target: TablePiece): boolean {
  if (target.locked || target.items.length === 0) {
    return false;
  }
  if (!piecesCanStack(piece, target) || target.zoneId !== draft.targetZoneId) {
    return false;
  }
  const shift = Math.hypot(draft.position[0] - target.position[0], draft.position[2] - target.position[2]);
  if (shift > 0.001) {
    return false;
  }
  return piecesTouchForStack(piece, draft.position, target);
}

function mergeTargetFor({ current, draft, piece }: DraftApplication): TablePiece | null {
  const target = current.pieces.find((candidate) => candidate.id === draft.targetPieceId);
  if (!target) {
    return null;
  }
  const liveTarget = { ...target, items: remainingItemsFor(target, draft) };
  return mergeTargetIsStable(piece, draft, liveTarget) ? target : null;
}

function piecesWithoutHeld(current: TableState, draft: DraftMove, piece: TablePiece): TablePiece[] {
  const pieces = draft.withdrawals.length ? piecesWithoutWithdrawals(current, draft) : current.pieces;
  return pieces.filter((candidate) => candidate.id !== piece.id);
}

function mergeEventFor(application: DraftApplication, target: TablePiece, warning: string | null): TableEvent {
  const { current, piece } = application;
  const count = pieceCount(piece);
  const units = piece.kind === 'card' ? ['card', 'cards'] : ['force', 'forces'];
  const unit = count === 1 ? units[0] : units[1];
  const placement = piece.kind === 'card' ? 'placed on' : 'stacked with';
  return {
    id: eventId(current.nextEventNumber),
    command: isShipment(current, piece, target.zoneId) ? 'ship.forces' : 'stack.merge',
    message: `${count} ${unit} ${placement} ${target.label}.`,
    status: warning ? 'accepted-with-warning' : 'accepted',
  };
}

function mergeHeldItems(basePieces: TablePiece[], target: TablePiece, piece: TablePiece): TablePiece[] {
  const items = [...target.items, ...piece.items];
  return basePieces.map((candidate) =>
    candidate.id === target.id ? { ...candidate, label: labelForCount(candidate, items.length), items } : candidate
  );
}

function applyMerge(application: DraftApplication): TableState {
  const { current, rejectedBase, draft, piece } = application;
  const target = mergeTargetFor(application);
  if (!target) {
    return rejection(rejectedBase, 'stack.merge', 'That stack target moved or is no longer available.');
  }
  if (current.enforcement === 'strict' && !viewerCanControl(current, target)) {
    return rejection(rejectedBase, 'stack.merge', `Another seat controls ${target.label}.`);
  }
  const liveTargetDraft = { ...draft, targetZoneId: target.zoneId };
  const constraint = strictDraftConstraint(current, piece, liveTargetDraft, 'That merge is not permitted.');
  if (constraint) {
    return rejection(rejectedBase, 'stack.merge', constraint);
  }
  const warning = assistedStackWarning(current, piece, target) ?? assistedWithdrawalWarning(current, liveTargetDraft);
  const basePieces = piecesWithoutHeld(current, draft, piece);
  const baseTarget = basePieces.find((candidate) => candidate.id === target.id);
  if (!baseTarget) {
    return rejection(rejectedBase, 'stack.merge', 'That stack target has no items left.');
  }
  return {
    ...current,
    pieces: mergeHeldItems(basePieces, baseTarget, piece),
    selectedPieceId: baseTarget.id,
    draftMove: null,
    ...appendEvent(current, mergeEventFor(application, target, warning)),
  };
}

function moveCommandFor({ current, draft, piece }: DraftApplication): string {
  if (isShipment(current, piece, draft.targetZoneId)) {
    return 'ship.forces';
  }
  const source = current.pieces.find((candidate) => candidate.id === draft.sourcePieceId);
  const peeledFromStack = Boolean(source && draft.withdrawals.length && pieceCount(source) > 1);
  if (!peeledFromStack) {
    return 'piece.move';
  }
  return piece.kind === 'card' ? 'deck.draw' : 'stack.split';
}

function piecesAfterMove(current: TableState, draft: DraftMove, movedPiece: TablePiece): TablePiece[] {
  if (draft.withdrawals.length) {
    return [...piecesWithoutHeld(current, draft, movedPiece), movedPiece];
  }
  return current.pieces.map((candidate) => (candidate.id === movedPiece.id ? movedPiece : candidate));
}

function applyMove(application: DraftApplication): TableState {
  const { current, draft, piece } = application;
  const warning = assistedMoveWarning(current, piece, draft.targetZoneId) ?? assistedWithdrawalWarning(current, draft);
  const destination = zoneById(draft.targetZoneId)?.label ?? 'a free table position';
  const event: TableEvent = {
    id: eventId(current.nextEventNumber),
    command: moveCommandFor(application),
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
    pieces: piecesAfterMove(current, draft, movedPiece),
    selectedPieceId: movedPiece.id,
    draftMove: null,
    ...appendEvent(current, event),
  };
}

export function applyDraftToState(current: TableState, requestedDraft: DraftMove): TableState {
  const application = resolveDraftApplication(current, requestedDraft);
  if ('rejected' in application) {
    return application.rejected;
  }
  const { draft, piece, rejectedBase } = application;
  const constraint = strictDraftConstraint(current, piece, draft, 'That move is not permitted.');
  if (constraint) {
    return rejection(rejectedBase, 'piece.move', constraint);
  }
  return draft.operation === 'merge' && draft.targetPieceId ? applyMerge(application) : applyMove(application);
}

function additionalTargetMatches(state: TableState, held: TablePiece, target: TablePiece, draft: DraftMove): boolean {
  if (target.zoneId !== draft.targetZoneId || target.locked) {
    return false;
  }
  if (!held.stackKey || target.stackKey !== held.stackKey) {
    return false;
  }
  return state.enforcement !== 'strict' || viewerCanControl(state, target);
}

function additionalTargetFor(state: TableState, draft: DraftMove): TablePiece | null {
  const heldPiece = heldPieceFor(state, draft);
  const target = state.pieces.find((piece) => piece.id === draft.targetPieceId);
  if (!heldPiece || !target) {
    return null;
  }
  const liveTarget = compatibleStackTarget(state, heldPiece, draft.position, { draft });
  if (liveTarget?.id !== target.id) {
    return null;
  }
  return additionalTargetMatches(state, heldPiece, target, draft) ? target : null;
}

export function draftWithAdditionalTop(state: TableState, draft: DraftMove): DraftMove | null {
  if (!draft.targetPieceId || !canTakeAdditionalFromDraft(state, draft)) {
    return null;
  }
  const target = additionalTargetFor(state, draft);
  if (!target) {
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
