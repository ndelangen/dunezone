import { Button, Text } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';
import { Surface } from '@ui/surface/Surface';
import { useCallback, useEffect, useId, useReducer, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Vector3 } from 'three';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import styles from './KeyboardSpicePlacement.module.css';
import { moveSpicePosition, visibleSpicePosition } from './spicePlacementGeometry';
import { SPICE_RESERVE_PICKUP } from './spiceReserveDrop';
import { SpiceTokenPreview } from './SpiceTokenPreview';

type Placement = { amount: number; factionId: string; position: Vector3Tuple };
type Change = { kind: 'pick-up'; placement: Placement } | { kind: 'move'; position: Vector3Tuple } | { kind: 'cancel' };
const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
const PLACEMENT_KEYS = new Set([...Object.keys(DIRECTIONS), 'Escape', 'Enter', ' ']);
type SpiceReserve = NonNullable<TableProjection['snapshot']['bank']>;

function amountFitsReserve(amount: number, bank: SpiceReserve): boolean {
  if (!Number.isSafeInteger(amount)) {
    return false;
  }
  return amount >= 1 && amount <= bank.balance;
}

/* Pickup and confirmation read the current seat's permission and balance, never an earlier projection. */
function withdrawableReserve(table: TableProjection | null | undefined, amount: number): SpiceReserve | undefined {
  if (!table?.canHandleTable) {
    return;
  }
  const bank = table.snapshot.bank;
  if (!bank) {
    return;
  }
  return amountFitsReserve(amount, bank) ? bank : undefined;
}

function canPlaceSpice(table: TableProjection | null | undefined, placement: Placement): boolean {
  return withdrawableReserve(table, placement.amount)?.factionId === placement.factionId;
}

function changePlacement(before: Placement | null, change: Change): Placement | null {
  if (change.kind === 'pick-up') {
    return change.placement;
  }
  if (change.kind === 'cancel') {
    return null;
  }
  return before && { ...before, position: change.position };
}

/** A keyboard pickup is only a preview; confirming its visible location sends the withdrawal. */
export function KeyboardSpicePlacement({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const { camera, renderer, invalidate } = useThree();
  const pointerSession = usePointerSession();
  const [placement, change] = useReducer(changePlacement, null);
  const source = useRef<HTMLElement | null>(null);
  const instructionId = useId();
  const cancel = useCallback(() => change({ kind: 'cancel' }), []);
  const finish = useCallback(() => {
    cancel();
    if (source.current?.isConnected) {
      source.current.focus({ preventScroll: true });
    }
  }, [cancel]);
  useEffect(() => {
    const canvas = renderer.domElement;
    const pickUp = (event: Event) => {
      const { amount } = (event as CustomEvent<{ amount: number }>).detail;
      const bank = withdrawableReserve(client.getTable(), amount);
      if (!bank || pointerSession.busy) {
        return;
      }
      const position = visibleSpicePosition(canvas, camera);
      if (!position) {
        return;
      }
      source.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      change({ kind: 'pick-up', placement: { amount, factionId: bank.factionId, position } });
    };
    canvas.addEventListener(SPICE_RESERVE_PICKUP, pickUp);
    return () => canvas.removeEventListener(SPICE_RESERVE_PICKUP, pickUp);
  }, [client, renderer, camera, pointerSession]);
  useEffect(() => {
    if (!placement) {
      return;
    }
    invalidate();
    if (!canPlaceSpice(table, placement)) {
      cancel();
    }
  }, [placement, table, invalidate, cancel]);
  const active = placement !== null;
  useEffect(() => {
    if (!active) {
      return;
    }
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [active, cancel]);
  if (!placement) {
    return null;
  }

  const move = (dx: number, dy: number, fine: boolean) => {
    const step = fine ? 4 : 20;
    const position = moveSpicePosition(renderer.domElement, camera, placement.position, [dx * step, dy * step]);
    if (position) {
      change({ kind: 'move', position });
    }
  };
  const confirm = () => {
    if (canPlaceSpice(client.getTable(), placement)) {
      client.command({ kind: 'bank-withdraw', amount: placement.amount, position: placement.position });
    }
    finish();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      event.stopPropagation();
      return;
    }
    if (!PLACEMENT_KEYS.has(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const direction = DIRECTIONS[event.key];
    if (direction) {
      move(direction[0], direction[1], event.shiftKey);
    } else if (event.key === 'Escape') {
      finish();
    } else if (!event.repeat) {
      confirm();
    }
  };
  const canvasBounds = renderer.domElement.getBoundingClientRect();
  const screen = new Vector3(...placement.position).project(camera);
  const screenX = ((screen.x + 1) * canvasBounds.width) / 2;
  const screenY = ((1 - screen.y) * canvasBounds.height) / 2;
  const hintWidth = Math.min(240, canvasBounds.width - 16);
  const hintCenter = Math.min(canvasBounds.width - hintWidth / 2 - 8, Math.max(hintWidth / 2 + 8, screenX));
  return (
    <Html position={placement.position} center zIndexRange={[40, 30]}>
      <DarkSchemeIsland>
        <div className={styles.placement} role="dialog" aria-label="Place spice on the table">
          <Button
            ref={(node) => {
              node?.focus({ preventScroll: true });
            }}
            variant="transparent"
            p={0}
            w={64}
            h={64}
            aria-label={`Place ${placement.amount} spice here`}
            aria-describedby={instructionId}
            onKeyDown={keyDown}
            onClick={confirm}
            onBlur={cancel}
          >
            <SpiceTokenPreview amount={placement.amount} />
          </Button>
          <div
            className={styles.instructions}
            id={instructionId}
            data-below={screenY < 128 || undefined}
            style={{ left: 32 + hintCenter - screenX, width: hintWidth }}
          >
            <Surface padding="sm" tone="ground">
              <Text size="xs">
                Arrow keys move the spice. Hold Shift for smaller steps. Enter places it; Escape cancels.
              </Text>
            </Surface>
          </div>
        </div>
      </DarkSchemeIsland>
    </Html>
  );
}
