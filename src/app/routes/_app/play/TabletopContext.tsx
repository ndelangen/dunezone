import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, SetStateAction } from 'react';

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

const TabletopContext = createContext<TabletopContextValue | null>(null);

export function TabletopProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<TabletopViewState>(() => ({
    table: freshTableState(),
    flippingPieceIds: new Map(),
  }));
  const { table: state, flippingPieceIds } = view;
  const setState = useCallback((update: SetStateAction<TableState>) => {
    setView((current) => {
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
    });
  }, []);
  const finishPieceFlip = useCallback((pieceId: string, revision: number) => {
    setView((current) => finishPieceFlipInView(current, pieceId, revision));
  }, []);
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);
  const [gestureActivePieceId, setGestureActivePieceId] = useState<string | null>(null);

  const renderedPieces = useMemo(() => renderedPiecesFor(state), [state]);
  const selectedPiece = useMemo(
    () => renderedPieces.find((piece) => piece.id === state.selectedPieceId) ?? null,
    [renderedPieces, state.selectedPieceId]
  );
  const affordances = useMemo(() => affordancesFor({ ...state, pieces: renderedPieces }), [renderedPieces, state]);

  const setHoveredPiece = useCallback((pieceId: string | null) => {
    setHoveredPieceId(pieceId);
  }, []);

  const selectPiece = useCallback(
    (pieceId: string | null) => {
      setState((current) => ({
        ...current,
        selectedPieceId: pieceId,
        draftMove: current.draftMove && current.draftMove.pieceId !== pieceId ? null : current.draftMove,
      }));
    },
    [setState]
  );

  const beginGesture = useCallback(
    (pieceId: string, pickup: 'top' | 'whole') => {
      setGestureActivePieceId(pieceId);
      setState((current) => {
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
      });
    },
    [setState]
  );

  useEffect(() => {
    if (gestureActivePieceId && !state.draftMove) {
      setGestureActivePieceId(null);
    }
  }, [gestureActivePieceId, state.draftMove]);

  const updateGesture = useCallback(
    (position: Vector3Tuple) => {
      setState((current) => {
        if (!current.draftMove) {
          return current;
        }
        const draftMove = projectCarryAtPosition(current, current.draftMove, position);
        return draftMove ? { ...current, draftMove } : { ...current, draftMove: null };
      });
    },
    [setState]
  );

  const finishGesture = useCallback(
    (position: Vector3Tuple) => {
      setGestureActivePieceId(null);
      setHoveredPieceId(null);
      setState((current) => {
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
      });
    },
    [setState]
  );

  const stageSelectedToZone = useCallback(
    (zoneId: string) => {
      setState((current) => {
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
      });
    },
    [setState]
  );

  const commitDraft = useCallback(() => {
    setState((current) => {
      const draft = current.draftMove;
      if (!draft) {
        return current;
      }
      const settledDraft = settleCarryAtPosition(current, draft, draft.position);
      return settledDraft ? applyDraftToState(current, settledDraft) : current;
    });
  }, [setState]);

  const cancelDraft = useCallback(() => {
    setGestureActivePieceId(null);
    setHoveredPieceId(null);
    setState((current) => ({
      ...current,
      selectedPieceId: current.draftMove?.sourcePieceId ?? current.selectedPieceId,
      draftMove: null,
    }));
  }, [setState]);

  const splitSelected = useCallback(
    (count = 1, pieceId?: string) => {
      setState((current) => {
        const selectedId = pieceId ?? current.selectedPieceId;
        const piece = current.pieces.find((candidate) => candidate.id === selectedId);
        if (!piece || pieceCount(piece) <= 1) {
          return current;
        }
        const command = piece.kind === 'card' ? 'deck.draw' : 'stack.split';
        if (piece.locked) {
          return rejection(current, command, `${piece.label} is locked.`);
        }
        if (current.enforcement === 'strict' && !viewerCanControl(current, piece)) {
          return rejection(current, command, `Another seat controls ${piece.label}.`);
        }

        const warning = assistedControlWarning(current, piece);

        const takeCount = Math.min(Math.max(1, Math.floor(count)), pieceCount(piece));
        const remainingItems = piece.items.slice(0, -takeCount);
        const takenItems = piece.items.slice(-takeCount);
        const splitId = `${piece.id}-take-${current.nextEventNumber}`;
        const isCard = piece.kind === 'card';
        const splitPiece: TablePiece = {
          ...piece,
          id: splitId,
          label: isCard
            ? takeCount === 1
              ? 'Treachery card'
              : 'Treachery cards'
            : takeCount === 1
              ? `${ownerLabel(piece)} force`
              : `${ownerLabel(piece)} forces`,
          items: takenItems,
          position: [
            piece.position[0] + (isCard ? 1.0 : 0.325),
            piece.position[1],
            piece.position[2] + (isCard ? 0.25 : 0.125),
          ],
        };
        const projectedPieces = current.pieces.flatMap((candidate) => {
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
        const splitPosition = nearestCollisionFreePosition(splitPiece, splitPiece.position, projectedPieces);
        if (!splitPosition) {
          return rejection(current, command, `There is no clear space beside ${piece.label}.`);
        }
        splitPiece.position = restingPositionAt(splitPosition, splitPiece);
        splitPiece.zoneId = nearestZone(splitPosition)?.id ?? null;
        const event: TableEvent = {
          id: eventId(current.nextEventNumber),
          command,
          message: isCard
            ? `${takeCount} ${takeCount === 1 ? 'card' : 'cards'} drawn from ${piece.label}.`
            : `${takeCount} ${takeCount === 1 ? 'force' : 'forces'} split from ${piece.label}.`,
          status: warning ? 'accepted-with-warning' : 'accepted',
        };
        return {
          ...current,
          pieces: [...projectedPieces, splitPiece],
          selectedPieceId: splitId,
          draftMove: null,
          ...appendEvent(current, event),
        };
      });
    },
    [setState]
  );

  const stackSelected = useCallback(
    (pieceId?: string) => {
      setState((current) => {
        const selectedId = pieceId ?? current.selectedPieceId;
        const piece = current.pieces.find((candidate) => candidate.id === selectedId);
        if (!piece || !piece.stackKey) {
          return current;
        }
        if (piece.locked) {
          return rejection(current, 'stack.merge', `${piece.label} is locked.`);
        }
        if (current.enforcement === 'strict' && !viewerCanControl(current, piece)) {
          return rejection(current, 'stack.merge', `Another seat controls ${piece.label}.`);
        }
        const target = compatibleStackTarget(current, piece, piece.position, null, true);
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
      });
    },
    [setState]
  );

  const takeAdditionalFromTarget = useCallback(() => {
    setState((current) => {
      const draft = current.draftMove;
      if (!draft) {
        return current;
      }
      const refreshedDraft = draftWithAdditionalTop(current, draft);
      return {
        ...current,
        draftMove: refreshedDraft ?? draft,
      };
    });
  }, [setState]);

  const rotateSelected = useCallback(
    (direction: -1 | 1 = 1, pieceId?: string) => {
      setState((current) => {
        const selectedId = current.draftMove?.pieceId ?? pieceId ?? current.selectedPieceId;
        const piece =
          current.draftMove?.pieceId === selectedId
            ? heldPieceFor(current, current.draftMove)
            : current.pieces.find((candidate) => candidate.id === selectedId);
        if (!piece) {
          return current;
        }
        if (piece.locked) {
          return rejection(current, 'piece.rotate', `${piece.label} is locked.`);
        }
        if (current.enforcement === 'strict' && !viewerCanControl(current, piece)) {
          return rejection(current, 'piece.rotate', `Another seat controls ${piece.label}.`);
        }
        const nextOrientation = piece.orientation + (direction * Math.PI) / 12;
        if (current.draftMove?.pieceId === selectedId) {
          const rotatedDraft = { ...current.draftMove, orientation: nextOrientation };
          const placedDraft = (gestureActivePieceId ? projectCarryAtPosition : settleCarryAtPosition)(
            current,
            rotatedDraft,
            rotatedDraft.position
          );
          return placedDraft ? { ...current, draftMove: placedDraft } : current;
        }
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
      });
    },
    [gestureActivePieceId, setState]
  );

  const flipSelected = useCallback((pieceId?: string) => {
    /* The command and lock are one update, so even same-frame requests are blocked. */
    setView((current) => requestPieceFlip(current, pieceId));
  }, []);

  const toggleLockSelected = useCallback(
    (pieceId?: string) => {
      setState((current) => {
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
      });
    },
    [setState]
  );

  const moveStormBy = useCallback(
    (direction: -1 | 1 = 1) => {
      setState((current) => moveStormInState(current, direction));
    },
    [setState]
  );

  const setEnforcement = useCallback(
    (enforcement: EnforcementPolicy) => {
      setGestureActivePieceId(null);
      setState((current) => ({ ...current, enforcement, draftMove: null }));
    },
    [setState]
  );

  const reset = useCallback(() => {
    setHoveredPieceId(null);
    setGestureActivePieceId(null);
    setState(freshTableState());
  }, [setState]);

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

  const numberKeyTimer = useRef<number | null>(null);
  const numberKeyOwner = useRef<string | null>(null);

  useEffect(() => {
    const clearNumberKeyTimer = (releasedKey?: string) => {
      if (releasedKey && numberKeyOwner.current !== releasedKey) {
        return;
      }
      if (numberKeyTimer.current !== null) {
        window.clearTimeout(numberKeyTimer.current);
        numberKeyTimer.current = null;
      }
      numberKeyOwner.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select, button, [role='separator']") || target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 't' && state.draftMove && canTakeAdditionalFromDraft(state, state.draftMove)) {
        event.preventDefault();
        if (!event.repeat) {
          takeAdditionalFromTarget();
        }
        return;
      }
      const pieceId = state.draftMove?.pieceId ?? hoveredPieceId ?? state.selectedPieceId ?? undefined;
      if (!pieceId) {
        return;
      }
      if (key === 'q' || key === 'e') {
        event.preventDefault();
        rotateSelected(key === 'q' ? -1 : 1, pieceId);
      } else if (state.draftMove) {
        return;
      } else if (key === 'f') {
        event.preventDefault();
        if (!event.repeat) {
          flipSelected(pieceId);
        }
      } else if (key === 'l') {
        event.preventDefault();
        toggleLockSelected(pieceId);
      } else if (key === 'g') {
        event.preventDefault();
        stackSelected(pieceId);
      } else if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        if (event.repeat || numberKeyTimer.current !== null) {
          return;
        }
        numberKeyOwner.current = key;
        numberKeyTimer.current = window.setTimeout(() => {
          numberKeyTimer.current = null;
          numberKeyOwner.current = null;
          splitSelected(Number(key), pieceId);
        }, 1000);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (/^[1-9]$/.test(event.key)) {
        clearNumberKeyTimer(event.key);
      }
    };
    const onBlur = () => clearNumberKeyTimer();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      clearNumberKeyTimer();
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
