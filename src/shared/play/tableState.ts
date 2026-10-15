import {
  factionTokenInSector,
  factionTokenRingAngle,
  factionTokenRingPose,
  factionTokenSectorPose,
  isFactionToken,
  sectorIndexAt,
} from './factionToken';
import { gestureBlockReason, isFlippablePiece, nearestZone, pieceCount, zoneById } from './model';
import type { DraftMove, TableEvent, TableItem, TablePiece, TableState, Vector3Tuple } from './model';
import { isSpicePiece } from './spice';
import { isSpiceBankPosition } from './spiceBank';
import { moveStormCounterclockwise } from './stormSector';
import { placementAnchorAtPosition } from './tableFurnitureLayout';
import type { PlacementAnchor } from './tableFurnitureLayout';
import { nearestBy, planarDistance, restingPositionAt, stackPreviewPositionFor } from './tableGeometry';
import {
  clampPositionToTable,
  isOverlapFreePosition,
  nearestCollisionFreePosition,
  piecesCanStack,
  piecesTouchForStack,
} from './tablePhysics';
import { isTroopStack } from './troop';

export function eventId(number: number): string {
  return `evt-${String(number).padStart(3, '0')}`;
}

/*
 * Hand-built card stacks without artwork (the local demo, a supply whose back is unpublished) stack only by key,
 * so the key is the one name they carry that no merge, split or deal can change.
 */
const CARD_STACK_NAMES: Readonly<Record<string, string>> = {
  'cards:treachery': 'Treachery',
  'cards:traitor': 'Traitor',
};

/*
 * The stable name of a card stack, if it has one: the word printed on its back, or for a stack without artwork, its key's name.
 * A blank back word names nothing. Cards with artwork stack by their back, not their key, so their key is never read.
 */
function cardStackName(piece: TablePiece): string | undefined {
  const artwork = piece.items[0]?.artwork;
  if (artwork) {
    return artwork.backName?.trim() ? artwork.backName : undefined;
  }
  return piece.stackKey ? CARD_STACK_NAMES[piece.stackKey] : undefined;
}

/**
 * The name a stack takes when its own items change.
 * A card stack is its stable name with the noun for its count: card, cards while held, deck otherwise;
 * without a stable name it reads as plain Card, Cards or Deck, never as its own earlier label.
 * A troop or token stack is named by its owner: the faction's display name, or Shared for a piece no faction owns.
 */
export function labelForCount(
  piece: TablePiece,
  count: number,
  factionNames: TableState['factionNames'],
  held = false
): string {
  if (isSpicePiece(piece)) {
    return 'Spice';
  }
  if (piece.kind === 'card') {
    return cardStackLabel(piece, count, held);
  }
  if (piece.kind === 'force') {
    return forceStackLabel(piece, count, factionNames);
  }
  return piece.label;
}

function cardStackLabel(piece: TablePiece, count: number, held: boolean): string {
  const noun = count === 1 ? 'card' : held ? 'cards' : 'deck';
  const name = cardStackName(piece);
  return name ? `${name} ${noun}` : capitalized(noun);
}

function forceStackLabel(piece: TablePiece, count: number, factionNames: TableState['factionNames']): string {
  const owner = piece.owner === 'shared' ? 'Shared' : factionNames[piece.owner];
  const [unit, units] = pieceUnits(piece);
  /* Every faction that owns a piece has a seat, so a missing name reads as plain troops or tokens rather than an id. */
  const [one, many] = owner ? [`${owner} ${unit}`, `${owner} ${units}`] : [capitalized(unit), capitalized(units)];
  return count === 1 ? one : many;
}

/** What one and several of a stack's units are called in a table event: cards, spice, troops or tokens. */
export function pieceUnits(piece: TablePiece): readonly [one: string, many: string] {
  if (piece.kind === 'card') {
    return ['card', 'cards'];
  }
  if (isSpicePiece(piece)) {
    return ['spice', 'spice'];
  }
  return isTroopStack(piece) ? ['troop', 'troops'] : ['token', 'tokens'];
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
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
  return piece
    ? {
        ...piece,
        inventory: undefined,
        battleOverlay: undefined,
        position: [...draft.position],
        orientation: draft.orientation,
      }
    : null;
}

/** The piece a carry holds, as it would land: turned over once for every flip made in hand. */
export function heldPieceFor(state: TableState, draft: DraftMove): TablePiece | null {
  const held = pieceAsPickedUp(state, draft);
  const flips = draft.flips ?? 0;
  if (!held || flips === 0 || !isFlippablePiece(held)) {
    return held;
  }
  return {
    ...held,
    items: flips % 2 === 1 ? turnedOver(held.items) : held.items,
    flipRevision: (held.flipRevision ?? 0) + flips,
  };
}

function pieceAsPickedUp(state: TableState, draft: DraftMove): TablePiece | null {
  const canonicalHeld = state.pieces.find((piece) => piece.id === draft.pieceId);
  if (!canonicalHeldMatchesDraft(canonicalHeld, draft)) {
    return null;
  }
  if (draft.withdrawals.length === 0) {
    const held = canonicalHeldAtPose(canonicalHeld, draft);
    return held && canonicalHeld?.inventory
      ? { ...held, items: held.items.map((item) => ({ ...item, faceUp: false })) }
      : held;
  }
  return withdrawalsAsPickedUp(state, draft, canonicalHeld);
}

/* A carry that took items off stacks holds them on top of whatever it already held, dressed as its source. */
function withdrawalsAsPickedUp(
  state: TableState,
  draft: DraftMove,
  canonicalHeld: TablePiece | undefined
): TablePiece | null {
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
    inventory: undefined,
    battleOverlay: undefined,
    label: labelForCount(source, items.length, state.factionNames, true),
    items: source.inventory ? items.map((item) => ({ ...item, faceUp: false })) : items,
    position: [...draft.position],
    orientation: draft.orientation,
    zoneId: source.zoneId,
    locked: source.locked,
  };
}

function remainingRenderedPiece(
  state: TableState,
  piece: TablePiece,
  draft: DraftMove,
  heldPiece: TablePiece
): TablePiece[] {
  if (piece.id === draft.pieceId) {
    return [heldPiece];
  }
  const remaining = pieceWithoutWithdrawals(state, piece, draft);
  if (remaining.length) {
    return remaining;
  }
  return withdrawnIdsFor(draft, piece.id).size > 0 ? [{ ...piece, items: [] }] : [];
}

/** A piece with the draft's withdrawals taken off, renamed only if it lost items; nothing once it has none left. */
function pieceWithoutWithdrawals(state: TableState, piece: TablePiece, draft: DraftMove): TablePiece[] {
  const withdrawn = withdrawnIdsFor(draft, piece.id).size > 0;
  const items = remainingItemsFor(piece, draft);
  if (!items.length) {
    return [];
  }
  return [withdrawn ? { ...piece, label: labelForCount(piece, items.length, state.factionNames), items } : piece];
}

/* A whole piece in hand shows each flip made while it is held. */
function withHeldTurnedOver(state: TableState, draft: DraftMove | null | undefined) {
  if (!draft?.flips) {
    return state.pieces;
  }
  const held = heldPieceFor(state, draft);
  return held ? state.pieces.map((piece) => (piece.id === held.id ? held : piece)) : state.pieces;
}

export function renderedPiecesFor(state: TableState): TablePiece[] {
  const draft = state.draftMove;
  const isShown = (piece: TablePiece) => !piece.inventory || piece.id === draft?.pieceId;
  if (!draft || draft.withdrawals.length === 0) {
    return withHeldTurnedOver(state, draft).filter(isShown);
  }
  const heldPiece = heldPieceFor(state, draft);
  if (!heldPiece) {
    return state.pieces.filter(isShown);
  }
  const canonicalHeld = state.pieces.some((piece) => piece.id === draft.pieceId);
  const remainingPieces = state.pieces.flatMap((piece) => remainingRenderedPiece(state, piece, draft, heldPiece));
  return (canonicalHeld ? remainingPieces : [...remainingPieces, heldPiece]).filter(isShown);
}

function appendEvent(state: TableState, event: TableEvent): Pick<TableState, 'events' | 'nextEventNumber'> {
  return {
    events: [event, ...state.events].slice(0, 8),
    nextEventNumber: state.nextEventNumber + 1,
  };
}

function logged(state: TableState, command: string, message: string, status: TableEvent['status']): TableState {
  return { ...state, ...appendEvent(state, { id: eventId(state.nextEventNumber), command, message, status }) };
}

/** The table with one accepted event appended, numbered from the table's own event counter. */
export function accepted(state: TableState, command: string, message: string): TableState {
  return logged(state, command, message, 'accepted');
}

function rejection(state: TableState, command: string, message: string): TableState {
  return logged(state, command, message, 'rejected');
}

type StackTargetOptions = { draft?: DraftMove | null; includeNearby?: boolean };

function stackCandidateIsAvailable(source: TablePiece, candidate: TablePiece): boolean {
  if (candidate.id === source.id || candidate.locked) {
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
  return includeNearby && planarDistance(position, candidate.position) <= nearbyRange;
}

function availableStackCandidates(state: TableState, source: TablePiece, draft: DraftMove | null): TablePiece[] {
  return state.pieces
    .map((candidate) => ({
      ...candidate,
      items: draft ? remainingItemsFor(candidate, draft) : candidate.items,
    }))
    .filter((candidate) => !candidate.inventory && stackCandidateIsAvailable(source, candidate));
}

export function compatibleStackTarget(
  state: TableState,
  source: TablePiece,
  position: Vector3Tuple,
  { draft = null, includeNearby = false }: StackTargetOptions = {}
): TablePiece | null {
  return nearestBy(availableStackCandidates(state, source, draft), (candidate) =>
    stackCandidateIsNear(source, position, candidate, includeNearby)
      ? planarDistance(position, candidate.position)
      : null
  );
}

function placementObstaclesFor(state: TableState, draft: DraftMove): TablePiece[] {
  return renderedPiecesFor({ ...state, draftMove: draft }).filter(
    (piece) => piece.id !== draft.pieceId && pieceCount(piece) > 0
  );
}

/** The draft as a plain move to a position, landing in a zone or none, onto no stack. */
function moveDraftTo(draft: DraftMove, position: Vector3Tuple, targetZoneId: string | null): DraftMove {
  return { ...draft, operation: 'move', position, targetZoneId, targetPieceId: null };
}

export function projectCarryAtPosition(state: TableState, draft: DraftMove, position: Vector3Tuple): DraftMove | null {
  const piece = heldPieceFor(state, draft);
  if (!piece) {
    return null;
  }
  if (isSpicePiece(piece) && isSpiceBankPosition(position)) {
    return moveDraftTo(draft, [...position], null);
  }
  if (isFactionToken(piece)) {
    const pose = factionTokenRingPose(factionTokenRingAngle(position), position[1]);
    return { ...moveDraftTo(draft, pose.position, null), orientation: pose.orientation };
  }
  const placementAnchor = placementAnchorAtPosition(piece, position);
  const targetPiece = anchoredStackTarget(state, draft, piece, position, placementAnchor);
  if (targetPiece) {
    return {
      ...draft,
      operation: 'merge',
      position: [...position],
      targetZoneId: targetPiece.zoneId,
      targetPieceId: targetPiece.id,
    };
  }
  if (placementAnchor) {
    return moveDraftTo(draft, [placementAnchor.position[0], position[1], placementAnchor.position[2]], null);
  }
  return moveDraftTo(draft, [...position], nearestZone(position)?.id ?? null);
}

/* The stack a held piece would join at `position`, judged in the anchor's pose and spot when it falls in one. */
function anchoredStackTarget(
  state: TableState,
  draft: DraftMove,
  piece: TablePiece,
  position: Vector3Tuple,
  placementAnchor: PlacementAnchor | null
): TablePiece | null {
  const projectedPiece = placementAnchor ? { ...piece, orientation: placementAnchor.orientation } : piece;
  const targetPosition = placementAnchor?.position ?? position;
  return compatibleStackTarget(state, projectedPiece, targetPosition, { draft });
}

/* A faction token settles at the centre of the sector it is over; a locked token already standing there keeps its place. */
function settleFactionTokenAt(state: TableState, draft: DraftMove, piece: TablePiece, position: Vector3Tuple) {
  const pose = factionTokenSectorPose(position);
  if (factionTokenInSector(state.pieces, pose.position, draft.sourcePieceId)?.locked) {
    return null;
  }
  const resting = restingPositionAt(pose.position, { ...piece, orientation: pose.orientation });
  return { ...moveDraftTo(draft, resting, null), orientation: pose.orientation };
}

function settleMoveAtPosition(
  state: TableState,
  draft: DraftMove,
  piece: TablePiece,
  position: Vector3Tuple
): DraftMove | null {
  if (isFactionToken(piece)) {
    return settleFactionTokenAt(state, draft, piece, position);
  }
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
    return { ...moveDraftTo(draft, anchoredPosition, null), orientation: placementAnchor.orientation };
  }
  const clampedPosition = clampPositionToTable(piece, restingPositionAt(position, piece));
  const resolvedPosition = nearestCollisionFreePosition(piece, clampedPosition, placementObstaclesFor(state, draft));
  if (!resolvedPosition) {
    return null;
  }
  const restingPosition = restingPositionAt(resolvedPosition, piece);
  return moveDraftTo(draft, restingPosition, nearestZone(restingPosition)?.id ?? null);
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
  if (isSpicePiece(piece) && isSpiceBankPosition(position)) {
    return projected;
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

/**
 * A piece played from a hand onto a placement anchor settles the way a carry released there would.
 * It takes the anchor's pose, or joins the compatible stack already resting in it with the played items on top.
 * A drop that misses every anchor returns null so the caller keeps its own placement.
 */
export function playFromHandAtAnchor(state: TableState, piece: TablePiece, position: Vector3Tuple): TableState | null {
  if (!placementAnchorAtPosition(piece, position)) {
    return null;
  }
  const table = { ...state, pieces: [...state.pieces, piece] };
  const draft = draftForGesture(piece, 'whole');
  const settled = draft && settleCarryAtPosition(table, draft, position);
  if (!settled) {
    return rejection(state, 'piece.move', 'There is no clear space for that object.');
  }
  return applyDraftToState(table, settled);
}

/*
 * A held piece turns over in hand as it would at rest, except a prediction card not yet revealed,
 * which lands face down so placing it stays its reveal (#1753). Once placed it turns like any card.
 */
export function canFlipInHand(
  piece: TablePiece | null | undefined,
  unrevealed: (stepId: string) => boolean
): piece is TablePiece {
  return (
    isFlippablePiece(piece) &&
    !piece.items.some((item) => item.artwork?.prediction && unrevealed(item.artwork.prediction.stepId))
  );
}

/** A stack turned over: its order reversed and every face the other way up. */
function turnedOver(items: TablePiece['items']): TablePiece['items'] {
  return [...items].reverse().map((item) => ({ ...item, faceUp: !item.faceUp }));
}

function flipMessageFor(flipped: TablePiece): string {
  return `${flipped.label} flipped ${flipped.items.at(-1)?.faceUp ? 'face up' : 'face down'}.`;
}

/* A carry that landed turned over is logged as a flip first, as if it were flipped where it was picked up. */
function withCarryFlipEvent(current: TableState, draft: DraftMove, piece: TablePiece): TableState {
  const turned = (draft.flips ?? 0) % 2 === 1 && isFlippablePiece(piece);
  return turned ? accepted(current, 'piece.flip', flipMessageFor(piece)) : current;
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
  const blockedReason = gestureBlockReason(piece);
  if (blockedReason) {
    return rejection(state, 'piece.flip', blockedReason);
  }
  const items = turnedOver(piece.items);
  return accepted(
    {
      ...state,
      selectedPieceId: piece.id,
      pieces: state.pieces.map((candidate) =>
        candidate.id === piece.id
          ? { ...piece, items, battleOverlay: undefined, flipRevision: (piece.flipRevision ?? 0) + 1 }
          : candidate
      ),
    },
    'piece.flip',
    flipMessageFor({ ...piece, items })
  );
}

export function moveStormInState(state: TableState, direction: -1 | 1 = 1): TableState {
  if (direction !== -1 && direction !== 1) {
    return state;
  }
  const stormSectorIndex = moveStormCounterclockwise(state.stormSectorIndex, direction);
  return accepted(
    { ...state, stormSectorIndex },
    'storm.move',
    direction > 0
      ? `Storm advanced to sector ${stormSectorIndex + 1}.`
      : `Storm moved back to sector ${stormSectorIndex + 1}.`
  );
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
    const blocked = gestureBlockReason(available.source);
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

/** Only a stack that lost items is renamed; every other stack keeps the name it has. */
function piecesWithoutWithdrawals(state: TableState, draft: DraftMove): TablePiece[] {
  return state.pieces.flatMap((piece) => pieceWithoutWithdrawals(state, piece, draft));
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

function validateDraftApplication(current: TableState, draft: DraftMove): DraftResolution {
  const rejectedBase = { ...current, selectedPieceId: draft.sourcePieceId, draftMove: null };
  const piece = heldPieceFor(current, draft);
  if (!piece) {
    return rejectDraft(rejectedBase, 'piece.move', 'The held object is no longer available.');
  }
  const blocked = gestureBlockReason(piece);
  if (blocked) {
    return rejectDraft(rejectedBase, 'piece.move', blocked);
  }
  const withdrawalConstraint = withdrawalConstraintMessage(current, draft);
  if (withdrawalConstraint) {
    return rejectDraft(rejectedBase, 'stack.take', withdrawalConstraint);
  }
  return { current, rejectedBase, draft, piece };
}

function resolveDraftApplication(current: TableState, draft: DraftMove): DraftResolution {
  const application = validateDraftApplication(current, draft);
  if ('rejected' in application) {
    return application;
  }
  return draft.operation === 'move' ? settleDraftApplication(application) : application;
}

function mergeTargetIsStable(piece: TablePiece, draft: DraftMove, target: TablePiece): boolean {
  if (target.locked || target.items.length === 0) {
    return false;
  }
  if (!piecesCanStack(piece, target) || target.zoneId !== draft.targetZoneId) {
    return false;
  }
  const shift = planarDistance(draft.position, target.position);
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

function mergeMessageFor(piece: TablePiece, target: TablePiece): string {
  const count = pieceCount(piece);
  const [one, many] = pieceUnits(piece);
  const unit = count === 1 ? one : many;
  const placement = piece.kind === 'card' ? 'placed on' : 'stacked with';
  return `${count} ${unit} ${placement} ${target.label}.`;
}

function mergeHeldItems(
  current: TableState,
  basePieces: TablePiece[],
  target: TablePiece,
  piece: TablePiece
): TablePiece[] {
  const items = [...target.items, ...piece.items];
  return basePieces.map((candidate) =>
    candidate.id === target.id
      ? {
          ...candidate,
          label: labelForCount(candidate, items.length, current.factionNames),
          items,
          battleOverlay: undefined,
        }
      : candidate
  );
}

function applyMerge(application: DraftApplication): TableState {
  const { current, rejectedBase, draft, piece } = application;
  const target = mergeTargetFor(application);
  if (!target) {
    return rejection(rejectedBase, 'stack.merge', 'That stack target moved or is no longer available.');
  }
  const basePieces = piecesWithoutHeld(current, draft, piece);
  const baseTarget = basePieces.find((candidate) => candidate.id === target.id);
  if (!baseTarget) {
    return rejection(rejectedBase, 'stack.merge', 'That stack target has no items left.');
  }
  return accepted(
    {
      ...current,
      pieces: mergeHeldItems(current, basePieces, baseTarget, piece),
      selectedPieceId: baseTarget.id,
      draftMove: null,
    },
    'stack.merge',
    mergeMessageFor(piece, target)
  );
}

function moveCommandFor({ current, draft, piece }: DraftApplication): string {
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

/* A faction token set down in a sector another token holds trades places with it: that token takes the sector the carried one came from. */
function swappedFactionTokens(current: TableState, draft: DraftMove, piece: TablePiece, pieces: TablePiece[]) {
  const occupant = isFactionToken(piece) && factionTokenInSector(current.pieces, draft.position, draft.sourcePieceId);
  if (!occupant || sectorIndexAt(occupant.position) === sectorIndexAt(draft.origin)) {
    return null;
  }
  const pose = factionTokenSectorPose(draft.origin);
  const moved = { ...occupant, orientation: pose.orientation };
  return {
    occupant,
    pieces: pieces.map((candidate) =>
      candidate.id === occupant.id ? { ...moved, position: restingPositionAt(pose.position, moved) } : candidate
    ),
  };
}

function applyFactionTokenMove(application: DraftApplication, movedPiece: TablePiece): TableState {
  const { current, draft, piece } = application;
  const pieces = piecesAfterMove(current, draft, movedPiece);
  const swap = swappedFactionTokens(current, draft, piece, pieces);
  return accepted(
    { ...current, pieces: swap?.pieces ?? pieces, selectedPieceId: movedPiece.id, draftMove: null },
    'piece.move',
    swap
      ? `${piece.label} swapped places with ${swap.occupant.label}.`
      : `${piece.label} moved to sector ${sectorIndexAt(draft.position) + 1}.`
  );
}

function applyMove(application: DraftApplication): TableState {
  const { current, draft, piece } = application;
  const destination = zoneById(draft.targetZoneId)?.label ?? 'a free table position';
  const movedPiece: TablePiece = {
    ...piece,
    position: [...draft.position],
    orientation: draft.orientation,
    zoneId: draft.targetZoneId,
  };
  if (isFactionToken(piece)) {
    return applyFactionTokenMove(application, movedPiece);
  }
  return accepted(
    {
      ...current,
      pieces: piecesAfterMove(current, draft, movedPiece),
      selectedPieceId: movedPiece.id,
      draftMove: null,
    },
    moveCommandFor(application),
    `${piece.label} moved to ${destination}.`
  );
}

function returnSpiceDraftToSpiceBank(current: TableState, draft: DraftMove, actorName = 'A player'): TableState {
  const application = validateDraftApplication(current, draft);
  if ('rejected' in application) {
    return application.rejected;
  }
  const { piece, rejectedBase } = application;
  const sources = [draft.sourcePieceId, ...draft.withdrawals.map((withdrawal) => withdrawal.sourcePieceId)];
  if (
    !isSpicePiece(piece) ||
    !isSpiceBankPosition(draft.position) ||
    sources.some((id) => !isSpicePiece(current.pieces.find((candidate) => candidate.id === id)))
  ) {
    return rejection(rejectedBase, 'spice.return', 'Only carried spice can be dropped on the Spice Bank.');
  }
  return accepted(
    { ...current, pieces: piecesWithoutHeld(current, draft, piece), selectedPieceId: null, draftMove: null },
    'spice.return',
    `${actorName} returned ${pieceCount(piece)} spice to the Spice Bank.`
  );
}

export function applyDraftToState(current: TableState, requestedDraft: DraftMove, actorName = 'A player'): TableState {
  if (isSpiceBankPosition(requestedDraft.position) && isSpicePiece(heldPieceFor(current, requestedDraft))) {
    return returnSpiceDraftToSpiceBank(current, requestedDraft, actorName);
  }
  const application = resolveDraftApplication(current, requestedDraft);
  if ('rejected' in application) {
    return application.rejected;
  }
  const flipLogged = {
    ...application,
    current: withCarryFlipEvent(application.current, application.draft, application.piece),
  };
  const { draft } = flipLogged;
  return draft.operation === 'merge' && draft.targetPieceId ? applyMerge(flipLogged) : applyMove(flipLogged);
}

function additionalTargetMatches(held: TablePiece, target: TablePiece, draft: DraftMove): boolean {
  if (target.zoneId !== draft.targetZoneId || target.locked) {
    return false;
  }
  return piecesCanStack(held, target);
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
  return additionalTargetMatches(heldPiece, target, draft) ? target : null;
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
  /* A piece turned over in hand would turn the next top over with it, so a flip ends taking more. */
  return (
    draft.pickedUpItemIds.length === 1 &&
    !draft.flips &&
    heldPiece !== null &&
    !heldPiece.locked &&
    withdrawalConstraintMessage(state, draft) === null
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
  const topItem = pickup === 'top' && count > 1 ? piece.items.at(-1) : undefined;
  const gesturePieceId = topItem ? `${piece.id}-held-${topItem.id}` : piece.id;

  return {
    operation: 'move',
    pieceId: gesturePieceId,
    sourcePieceId: piece.id,
    pickedUpItemIds: topItem ? [topItem.id] : piece.items.map((item) => item.id),
    withdrawals: topItem ? [{ sourcePieceId: piece.id, itemId: topItem.id }] : [],
    origin: [...piece.position],
    originOrientation: piece.orientation,
    position: [...piece.position],
    orientation: piece.orientation,
    targetZoneId: piece.zoneId,
    targetPieceId: null,
  };
}
