import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject, SetStateAction } from 'react';

import {
  affordancesFor,
  dropPositionFor,
  freshTableState,
  gestureBlockReason,
  nearestZone,
  pieceCount,
  viewerCanControl,
  zoneById,
} from './model';
import type { DraftMove, EnforcementPolicy, TableEvent, TablePiece, TableState, Vector3Tuple } from './model';
import { restingPositionAt, stackPreviewPositionFor } from './tableGeometry';
import { isCollisionFreePosition, nearestCollisionFreePosition } from './tablePhysics';
import {
  eventId,
  ownerLabel,
  labelForCount,
  heldPieceFor,
  renderedPiecesFor,
  rejection,
  moveConstraintMessage,
  assistedMoveWarning,
  assistedControlWarning,
  assistedStackWarning,
  compatibleStackTarget,
  appendEvent,
  projectCarryAtPosition,
  settleCarryAtPosition,
  requestPieceFlip,
  finishPieceFlipInView,
  moveStormInState,
  applyDraftToState,
  draftWithAdditionalTop,
  canTakeAdditionalFromDraft,
  draftForGesture,
} from './tableState';
import type { TabletopViewState } from './tableState';
export * from './tableState';

export type TabletopContextValue = {
  state: TableState;
  selectedPiece: TablePiece | null;
  renderedPieces: TablePiece[];
  hoveredPieceId: string | null;
  gestureActivePieceId: string | null;
  flippingPieceIds: ReadonlyMap<string, number>;
  finishPieceFlip(pieceId: string, revision: number): void;
  affordances: ReturnType<typeof affordancesFor>;
  renderedPositionFor(piece: TablePiece): Vector3Tuple;
  renderedOrientationFor(piece: TablePiece): number;
  selectPiece(pieceId: string | null): void;
  setHoveredPiece(pieceId: string | null): void;
  beginGesture(pieceId: string, pickup: 'top' | 'whole'): void;
  updateGesture(position: Vector3Tuple): void;
  finishGesture(position: Vector3Tuple): void;
  stageSelectedToZone(zoneId: string): void;
  commitDraft(): void;
  cancelDraft(): void;
  splitSelected(count?: number, pieceId?: string): void;
  stackSelected(pieceId?: string): void;
  takeAdditionalFromTarget(): void;
  rotateSelected(direction?: -1 | 1, pieceId?: string): void;
  flipSelected(pieceId?: string): void;
  toggleLockSelected(pieceId?: string): void;
  moveStormBy(direction?: -1 | 1): void;
  setEnforcement(policy: EnforcementPolicy): void;
  reset(): void;
};

export const TabletopContext = createContext<TabletopContextValue | null>(null);

function selectPieceInState(current: TableState, pieceId: string | null): TableState {
  return {
    ...current,
    selectedPieceId: pieceId,
    draftMove: current.draftMove && current.draftMove.pieceId !== pieceId ? null : current.draftMove,
  };
}

function beginGestureInState(current: TableState, pieceId: string, pickup: 'top' | 'whole'): TableState {
  const piece = current.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    return current;
  }
  const blockReason = gestureBlockReason(current, piece);
  if (blockReason) {
    return rejection(current, 'piece.move', blockReason);
  }
  const draftMove = draftForGesture(piece, pickup);
  if (!draftMove) {
    return current;
  }

  return {
    ...current,
    selectedPieceId: draftMove.pieceId,
    draftMove,
  };
}

function updateGestureInState(current: TableState, position: Vector3Tuple): TableState {
  if (!current.draftMove) {
    return current;
  }
  const draftMove = projectCarryAtPosition(current, current.draftMove, position);
  return draftMove ? { ...current, draftMove } : { ...current, draftMove: null };
}

function finishGestureInState(current: TableState, position: Vector3Tuple): TableState {
  if (!current.draftMove) {
    return current;
  }
  const draftMove = settleCarryAtPosition(current, current.draftMove, position);
  if (!draftMove) {
    return {
      ...current,
      selectedPieceId: current.draftMove.sourcePieceId,
      draftMove: null,
    };
  }
  return applyDraftToState(current, draftMove);
}

function stageSelectedToZoneInState(current: TableState, zoneId: string): TableState {
  const piece = current.pieces.find((candidate) => candidate.id === current.selectedPieceId);
  const zone = zoneById(zoneId);
  if (!piece || !zone) {
    return current;
  }
  if (piece.locked) {
    return rejection(current, 'piece.move', `${piece.label} is locked.`);
  }
  const constraint = moveConstraintMessage(current, piece, zone.id);
  if (current.enforcement === 'strict' && constraint) {
    return rejection(current, 'piece.move', constraint);
  }

  const draft: DraftMove = {
    operation: 'move',
    pieceId: piece.id,
    sourcePieceId: piece.id,
    pickedUpItemIds: piece.items.map((item) => item.id),
    withdrawals: [],
    origin: [...piece.position],
    originOrientation: piece.orientation,
    position: dropPositionFor(zone, piece),
    orientation: piece.orientation,
    targetZoneId: zone.id,
    targetPieceId: null,
    warning: assistedMoveWarning(current, piece, zone.id),
  };
  const placedDraft = settleCarryAtPosition(current, draft, draft.position);
  return placedDraft ? { ...current, draftMove: placedDraft } : current;
}

function commitDraftInState(current: TableState): TableState {
  const draft = current.draftMove;
  if (!draft) {
    return current;
  }
  const settledDraft = settleCarryAtPosition(current, draft, draft.position);
  return settledDraft ? applyDraftToState(current, settledDraft) : current;
}

function cancelDraftInState(current: TableState): TableState {
  return {
    ...current,
    selectedPieceId: current.draftMove?.sourcePieceId ?? current.selectedPieceId,
    draftMove: null,
  };
}

function manipulationBlockReason(current: TableState, piece: TablePiece) {
  if (piece.locked) {
    return `${piece.label} is locked.`;
  }
  if (current.enforcement === 'strict' && !viewerCanControl(current, piece)) {
    return `Another seat controls ${piece.label}.`;
  }
  return null;
}

function splitPieceFor(piece: TablePiece, takeCount: number, nextEventNumber: number): TablePiece {
  const isCard = piece.kind === 'card';
  return {
    ...piece,
    id: `${piece.id}-take-${nextEventNumber}`,
    label: isCard
      ? takeCount === 1
        ? 'Treachery card'
        : 'Treachery cards'
      : takeCount === 1
        ? `${ownerLabel(piece)} force`
        : `${ownerLabel(piece)} forces`,
    items: piece.items.slice(-takeCount),
    position: [
      piece.position[0] + (isCard ? 1.0 : 0.325),
      piece.position[1],
      piece.position[2] + (isCard ? 0.25 : 0.125),
    ],
  };
}

function piecesAfterSplit(pieces: TablePiece[], piece: TablePiece, remainingItems: TablePiece['items']) {
  return pieces.flatMap((candidate) => {
    if (candidate.id !== piece.id) {
      return [candidate];
    }
    return remainingItems.length
      ? [
          {
            ...candidate,
            label: labelForCount(candidate, remainingItems.length),
            items: remainingItems,
          },
        ]
      : [];
  });
}

function splitEventFor(current: TableState, piece: TablePiece, takeCount: number): TableEvent {
  const isCard = piece.kind === 'card';
  const warning = assistedControlWarning(current, piece);
  return {
    id: eventId(current.nextEventNumber),
    command: isCard ? 'deck.draw' : 'stack.split',
    message: isCard
      ? `${takeCount} ${takeCount === 1 ? 'card' : 'cards'} drawn from ${piece.label}.`
      : `${takeCount} ${takeCount === 1 ? 'force' : 'forces'} split from ${piece.label}.`,
    status: warning ? 'accepted-with-warning' : 'accepted',
  };
}

function splitSelectedInState(current: TableState, count: number, pieceId?: string): TableState {
  const selectedId = pieceId ?? current.selectedPieceId;
  const piece = current.pieces.find((candidate) => candidate.id === selectedId);
  if (!piece || pieceCount(piece) <= 1) {
    return current;
  }
  const command = piece.kind === 'card' ? 'deck.draw' : 'stack.split';
  const blockReason = manipulationBlockReason(current, piece);
  if (blockReason) {
    return rejection(current, command, blockReason);
  }
  const takeCount = Math.min(Math.max(1, Math.floor(count)), pieceCount(piece));
  const splitPiece = splitPieceFor(piece, takeCount, current.nextEventNumber);
  const projectedPieces = piecesAfterSplit(current.pieces, piece, piece.items.slice(0, -takeCount));
  const splitPosition = nearestCollisionFreePosition(splitPiece, splitPiece.position, projectedPieces);
  if (!splitPosition) {
    return rejection(current, command, `There is no clear space beside ${piece.label}.`);
  }
  splitPiece.position = restingPositionAt(splitPosition, splitPiece);
  splitPiece.zoneId = nearestZone(splitPosition)?.id ?? null;
  return {
    ...current,
    pieces: [...projectedPieces, splitPiece],
    selectedPieceId: splitPiece.id,
    draftMove: null,
    ...appendEvent(current, splitEventFor(current, piece, takeCount)),
  };
}

function stackSelectedInState(current: TableState, pieceId?: string): TableState {
  const selectedId = pieceId ?? current.selectedPieceId;
  const piece = current.pieces.find((candidate) => candidate.id === selectedId);
  if (!piece || !piece.stackKey) {
    return current;
  }
  const blockReason = manipulationBlockReason(current, piece);
  if (blockReason) {
    return rejection(current, 'stack.merge', blockReason);
  }
  const target = compatibleStackTarget(current, piece, piece.position, { includeNearby: true });
  if (!target) {
    return current;
  }
  return applyDraftToState(current, {
    operation: 'merge',
    pieceId: piece.id,
    sourcePieceId: piece.id,
    pickedUpItemIds: piece.items.map((item) => item.id),
    withdrawals: [],
    origin: [...piece.position],
    originOrientation: piece.orientation,
    position: stackPreviewPositionFor(target),
    orientation: piece.orientation,
    targetZoneId: target.zoneId,
    targetPieceId: target.id,
    warning: assistedStackWarning(current, piece, target),
  });
}

function takeAdditionalFromTargetInState(current: TableState): TableState {
  const draft = current.draftMove;
  if (!draft) {
    return current;
  }
  const refreshedDraft = draftWithAdditionalTop(current, draft);
  return {
    ...current,
    draftMove: refreshedDraft ?? draft,
  };
}

function rotationSelection(current: TableState, pieceId: string | undefined) {
  const selectedId = current.draftMove?.pieceId ?? pieceId ?? current.selectedPieceId;
  const piece =
    current.draftMove?.pieceId === selectedId
      ? heldPieceFor(current, current.draftMove)
      : current.pieces.find((candidate) => candidate.id === selectedId);
  return { selectedId, piece };
}

function rotateSelectedInState(
  current: TableState,
  direction: -1 | 1,
  pieceId: string | undefined,
  gestureActivePieceId: string | null
): TableState {
  const { selectedId, piece } = rotationSelection(current, pieceId);
  if (!piece) {
    return current;
  }
  const blockReason = manipulationBlockReason(current, piece);
  if (blockReason) {
    return rejection(current, 'piece.rotate', blockReason);
  }
  const nextOrientation = piece.orientation + (direction * Math.PI) / 12;
  if (current.draftMove?.pieceId === selectedId) {
    return rotateDraftInState(current, current.draftMove, nextOrientation, gestureActivePieceId);
  }
  return rotateRestingPieceInState(current, piece, direction);
}

function rotateDraftInState(
  current: TableState,
  draft: DraftMove,
  orientation: number,
  gestureActivePieceId: string | null
) {
  const rotatedDraft = { ...draft, orientation };
  const placedDraft = (gestureActivePieceId ? projectCarryAtPosition : settleCarryAtPosition)(
    current,
    rotatedDraft,
    rotatedDraft.position
  );
  return placedDraft ? { ...current, draftMove: placedDraft } : current;
}

function rotateRestingPieceInState(current: TableState, piece: TablePiece, direction: -1 | 1): TableState {
  const nextOrientation = piece.orientation + (direction * Math.PI) / 12;
  const rotatedPiece = {
    ...piece,
    orientation: nextOrientation,
    position: restingPositionAt(piece.position, {
      kind: piece.kind,
      orientation: nextOrientation,
    }),
  };
  const obstacles = current.pieces.filter((candidate) => candidate.id !== piece.id && pieceCount(candidate) > 0);
  if (!isCollisionFreePosition(rotatedPiece, piece.position, obstacles)) {
    return rejection(current, 'piece.rotate', `${piece.label} does not have room to rotate here.`);
  }
  const warning = assistedControlWarning(current, piece);
  const event: TableEvent = {
    id: eventId(current.nextEventNumber),
    command: 'piece.rotate',
    message: `${piece.label} rotated ${direction > 0 ? 'clockwise' : 'counterclockwise'} by 15 degrees.`,
    status: warning ? 'accepted-with-warning' : 'accepted',
  };
  return {
    ...current,
    selectedPieceId: piece.id,
    draftMove: null,
    pieces: current.pieces.map((candidate) => (candidate.id === piece.id ? rotatedPiece : candidate)),
    ...appendEvent(current, event),
  };
}

function toggleLockSelectedInState(current: TableState, pieceId?: string): TableState {
  const selectedId = pieceId ?? current.selectedPieceId;
  const piece = current.pieces.find((candidate) => candidate.id === selectedId);
  if (!piece) {
    return current;
  }
  if (current.enforcement === 'strict' && !viewerCanControl(current, piece)) {
    return rejection(current, 'piece.lock', `Another seat controls ${piece.label}.`);
  }
  const warning = assistedControlWarning(current, piece);
  const nextLocked = !piece.locked;
  const event: TableEvent = {
    id: eventId(current.nextEventNumber),
    command: 'piece.lock',
    message: `${piece.label} ${nextLocked ? 'locked' : 'unlocked'}.`,
    status: warning ? 'accepted-with-warning' : 'accepted',
  };
  return {
    ...current,
    selectedPieceId: piece.id,
    draftMove: null,
    pieces: current.pieces.map((candidate) =>
      candidate.id === piece.id ? { ...candidate, locked: nextLocked } : candidate
    ),
    ...appendEvent(current, event),
  };
}

function setEnforcementInState(current: TableState, enforcement: EnforcementPolicy): TableState {
  return { ...current, enforcement, draftMove: null };
}

type TableKeyboardControls = Pick<
  TabletopContextValue,
  | 'flipSelected'
  | 'hoveredPieceId'
  | 'rotateSelected'
  | 'splitSelected'
  | 'stackSelected'
  | 'state'
  | 'takeAdditionalFromTarget'
  | 'toggleLockSelected'
>;

function clearNumberKeyDraw(timer: RefObject<number | null>, owner: RefObject<string | null>, releasedKey?: string) {
  if (releasedKey && owner.current !== releasedKey) {
    return;
  }
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
  owner.current = null;
}

function createNumberKeyDraw(
  timer: RefObject<number | null>,
  owner: RefObject<string | null>,
  splitSelected: TabletopContextValue['splitSelected']
) {
  return {
    start(event: KeyboardEvent, pieceId: string) {
      if (event.repeat || timer.current !== null) {
        return;
      }
      const key = event.key.toLowerCase();
      owner.current = key;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        owner.current = null;
        splitSelected(Number(key), pieceId);
      }, 1000);
    },
    clear(releasedKey?: string) {
      clearNumberKeyDraw(timer, owner, releasedKey);
    },
  };
}

function keyboardTargetIsControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.matches("input, textarea, select, button, [role='separator']") || target.isContentEditable;
}

function canTakeUsingKeyboard(key: string, state: TableState) {
  if (key !== 't' || !state.draftMove) {
    return false;
  }
  return canTakeAdditionalFromDraft(state, state.draftMove);
}

function handleRestingPieceKey(
  event: KeyboardEvent,
  pieceId: string,
  controls: TableKeyboardControls,
  draw: ReturnType<typeof createNumberKeyDraw>
) {
  const key = event.key.toLowerCase();
  const actions = new Map<string, () => void>([
    [
      'f',
      () => {
        if (!event.repeat) {
          controls.flipSelected(pieceId);
        }
      },
    ],
    ['l', () => controls.toggleLockSelected(pieceId)],
    ['g', () => controls.stackSelected(pieceId)],
  ]);
  const action = actions.get(key);
  if (action) {
    event.preventDefault();
    action();
  } else if (/^[1-9]$/.test(key)) {
    event.preventDefault();
    draw.start(event, pieceId);
  }
}

function handleTableKeyDown(
  event: KeyboardEvent,
  controls: TableKeyboardControls,
  draw: ReturnType<typeof createNumberKeyDraw>
) {
  if (keyboardTargetIsControl(event.target)) {
    return;
  }
  if (keyboardHasModifier(event)) {
    return;
  }
  const { state } = controls;
  const key = event.key.toLowerCase();
  if (canTakeUsingKeyboard(key, state)) {
    event.preventDefault();
    if (!event.repeat) {
      controls.takeAdditionalFromTarget();
    }
    return;
  }
  const pieceId = keyboardPieceId(controls);
  if (!pieceId) {
    return;
  }
  const direction = new Map<string, -1 | 1>([
    ['q', -1],
    ['e', 1],
  ]).get(key);
  if (direction) {
    event.preventDefault();
    controls.rotateSelected(direction, pieceId);
    return;
  }
  if (!state.draftMove) {
    handleRestingPieceKey(event, pieceId, controls, draw);
  }
}

function keyboardHasModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function keyboardPieceId({ state, hoveredPieceId }: TableKeyboardControls) {
  return state.draftMove?.pieceId ?? hoveredPieceId ?? state.selectedPieceId ?? undefined;
}

export function useTableKeyboard({
  flipSelected,
  hoveredPieceId,
  rotateSelected,
  splitSelected,
  stackSelected,
  state,
  takeAdditionalFromTarget,
  toggleLockSelected,
}: TableKeyboardControls) {
  const numberKeyTimer = useRef<number | null>(null);
  const numberKeyOwner = useRef<string | null>(null);

  useEffect(() => () => clearNumberKeyDraw(numberKeyTimer, numberKeyOwner), []);

  useEffect(() => {
    const controls = {
      flipSelected,
      hoveredPieceId,
      rotateSelected,
      splitSelected,
      stackSelected,
      state,
      takeAdditionalFromTarget,
      toggleLockSelected,
    };
    const draw = createNumberKeyDraw(numberKeyTimer, numberKeyOwner, splitSelected);
    const onKeyDown = (event: KeyboardEvent) => handleTableKeyDown(event, controls, draw);
    const onKeyUp = (event: KeyboardEvent) => {
      if (/^[1-9]$/.test(event.key)) {
        draw.clear(event.key);
      }
    };
    const onBlur = () => draw.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    flipSelected,
    hoveredPieceId,
    rotateSelected,
    splitSelected,
    stackSelected,
    state,
    takeAdditionalFromTarget,
    toggleLockSelected,
  ]);
}

function updateTabletopView(current: TabletopViewState, update: SetStateAction<TableState>): TabletopViewState {
  const table = typeof update === 'function' ? update(current.table) : update;
  if (table === current.table) {
    return current;
  }
  /* Removed or replaced objects must not leave stale animation locks. */
  const active = new Map(
    [...current.flippingPieceIds].filter(([id, revision]) =>
      table.pieces.some((piece) => piece.id === id && piece.flipRevision === revision)
    )
  );
  return { table, flippingPieceIds: active };
}

type SetTableState = (update: SetStateAction<TableState>) => void;

function useTableInteraction(setState: SetTableState, draftMove: DraftMove | null) {
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);
  const [gestureActivePieceId, setGestureActivePieceId] = useState<string | null>(null);

  const setHoveredPiece = useCallback((pieceId: string | null) => {
    setHoveredPieceId(pieceId);
  }, []);

  const selectPiece = useCallback(
    (pieceId: string | null) => {
      setState((current) => selectPieceInState(current, pieceId));
    },
    [setState]
  );

  const beginGesture = useCallback(
    (pieceId: string, pickup: 'top' | 'whole') => {
      setGestureActivePieceId(pieceId);
      setState((current) => beginGestureInState(current, pieceId, pickup));
    },
    [setState]
  );

  useEffect(() => {
    if (gestureActivePieceId && !draftMove) {
      setGestureActivePieceId(null);
    }
  }, [gestureActivePieceId, draftMove]);

  const updateGesture = useCallback(
    (position: Vector3Tuple) => {
      setState((current) => updateGestureInState(current, position));
    },
    [setState]
  );

  const finishGesture = useCallback(
    (position: Vector3Tuple) => {
      setGestureActivePieceId(null);
      setHoveredPieceId(null);
      setState((current) => finishGestureInState(current, position));
    },
    [setState]
  );

  const stageSelectedToZone = useCallback(
    (zoneId: string) => {
      setState((current) => stageSelectedToZoneInState(current, zoneId));
    },
    [setState]
  );

  const commitDraft = useCallback(() => {
    setState((current) => commitDraftInState(current));
  }, [setState]);

  const cancelDraft = useCallback(() => {
    setGestureActivePieceId(null);
    setHoveredPieceId(null);
    setState((current) => cancelDraftInState(current));
  }, [setState]);

  const setEnforcement = useCallback(
    (enforcement: EnforcementPolicy) => {
      setGestureActivePieceId(null);
      setState((current) => setEnforcementInState(current, enforcement));
    },
    [setState]
  );

  const reset = useCallback(() => {
    setHoveredPieceId(null);
    setGestureActivePieceId(null);
    setState(freshTableState());
  }, [setState]);

  return {
    hoveredPieceId,
    gestureActivePieceId,
    setHoveredPiece,
    selectPiece,
    beginGesture,
    updateGesture,
    finishGesture,
    stageSelectedToZone,
    commitDraft,
    cancelDraft,
    setEnforcement,
    reset,
  };
}

function usePieceCommands(setState: SetTableState, gestureActivePieceId: string | null) {
  const splitSelected = useCallback(
    (count = 1, pieceId?: string) => {
      /* A delayed number-key draw must not interrupt a carry started after keydown. */
      setState((current) => (current.draftMove ? current : splitSelectedInState(current, count, pieceId)));
    },
    [setState]
  );

  const stackSelected = useCallback(
    (pieceId?: string) => {
      setState((current) => stackSelectedInState(current, pieceId));
    },
    [setState]
  );

  const takeAdditionalFromTarget = useCallback(() => {
    setState((current) => takeAdditionalFromTargetInState(current));
  }, [setState]);

  const rotateSelected = useCallback(
    (direction: -1 | 1 = 1, pieceId?: string) => {
      setState((current) => rotateSelectedInState(current, direction, pieceId, gestureActivePieceId));
    },
    [gestureActivePieceId, setState]
  );

  const toggleLockSelected = useCallback(
    (pieceId?: string) => {
      setState((current) => toggleLockSelectedInState(current, pieceId));
    },
    [setState]
  );

  const moveStormBy = useCallback(
    (direction: -1 | 1 = 1) => {
      setState((current) => moveStormInState(current, direction));
    },
    [setState]
  );

  return { splitSelected, stackSelected, takeAdditionalFromTarget, rotateSelected, toggleLockSelected, moveStormBy };
}

function useTableProjection(state: TableState) {
  const renderedPieces = useMemo(() => renderedPiecesFor(state), [state]);
  const selectedPiece = useMemo(
    () => renderedPieces.find((piece) => piece.id === state.selectedPieceId) ?? null,
    [renderedPieces, state.selectedPieceId]
  );
  const affordances = useMemo(() => affordancesFor({ ...state, pieces: renderedPieces }), [renderedPieces, state]);

  const renderedPositionFor = useCallback(
    (piece: TablePiece): Vector3Tuple =>
      state.draftMove?.pieceId === piece.id ? state.draftMove.position : piece.position,
    [state.draftMove]
  );

  const renderedOrientationFor = useCallback(
    (piece: TablePiece): number =>
      state.draftMove?.pieceId === piece.id ? state.draftMove.orientation : piece.orientation,
    [state.draftMove]
  );

  return { renderedPieces, selectedPiece, affordances, renderedPositionFor, renderedOrientationFor };
}

export function TabletopProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<TabletopViewState>(() => ({
    table: freshTableState(),
    flippingPieceIds: new Map(),
  }));
  const { table: state, flippingPieceIds } = view;
  const setState = useCallback((update: SetStateAction<TableState>) => {
    setView((current) => updateTabletopView(current, update));
  }, []);
  const finishPieceFlip = useCallback((pieceId: string, revision: number) => {
    setView((current) => finishPieceFlipInView(current, pieceId, revision));
  }, []);
  const {
    hoveredPieceId,
    gestureActivePieceId,
    setHoveredPiece,
    selectPiece,
    beginGesture,
    updateGesture,
    finishGesture,
    stageSelectedToZone,
    commitDraft,
    cancelDraft,
    setEnforcement,
    reset,
  } = useTableInteraction(setState, state.draftMove);
  const { splitSelected, stackSelected, takeAdditionalFromTarget, rotateSelected, toggleLockSelected, moveStormBy } =
    usePieceCommands(setState, gestureActivePieceId);
  const { renderedPieces, selectedPiece, affordances, renderedPositionFor, renderedOrientationFor } =
    useTableProjection(state);

  const flipSelected = useCallback((pieceId?: string) => {
    /* The command and lock are one update, so even same-frame requests are blocked. */
    setView((current) => requestPieceFlip(current, pieceId));
  }, []);

  useTableKeyboard({
    flipSelected,
    hoveredPieceId,
    rotateSelected,
    splitSelected,
    stackSelected,
    state,
    takeAdditionalFromTarget,
    toggleLockSelected,
  });

  const value = useMemo<TabletopContextValue>(
    () => ({
      state,
      selectedPiece,
      renderedPieces,
      hoveredPieceId,
      gestureActivePieceId,
      flippingPieceIds,
      finishPieceFlip,
      affordances,
      renderedPositionFor,
      renderedOrientationFor,
      selectPiece,
      setHoveredPiece,
      beginGesture,
      updateGesture,
      finishGesture,
      stageSelectedToZone,
      commitDraft,
      cancelDraft,
      splitSelected,
      stackSelected,
      takeAdditionalFromTarget,
      rotateSelected,
      flipSelected,
      toggleLockSelected,
      moveStormBy,
      setEnforcement,
      reset,
    }),
    [
      affordances,
      beginGesture,
      cancelDraft,
      commitDraft,
      finishGesture,
      finishPieceFlip,
      flipSelected,
      flippingPieceIds,
      gestureActivePieceId,
      hoveredPieceId,
      moveStormBy,
      renderedPositionFor,
      renderedOrientationFor,
      renderedPieces,
      reset,
      rotateSelected,
      selectPiece,
      selectedPiece,
      setEnforcement,
      setHoveredPiece,
      splitSelected,
      stackSelected,
      stageSelectedToZone,
      state,
      takeAdditionalFromTarget,
      toggleLockSelected,
      updateGesture,
    ]
  );

  return <TabletopContext.Provider value={value}>{children}</TabletopContext.Provider>;
}

export function useTabletop(): TabletopContextValue {
  const value = useContext(TabletopContext);
  if (!value) {
    throw new Error('useTabletop must be used inside TabletopProvider');
  }
  return value;
}
