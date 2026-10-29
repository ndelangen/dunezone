import { Button, Text } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { createSpiceStack } from '@shared/play/spiceBank';
import { clampPositionToTable } from '@shared/play/tablePhysics';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';
import { Surface } from '@ui/surface/Surface';
import { useCallback, useEffect, useId, useReducer, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Vector3 } from 'three';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import styles from './KeyboardSpicePlacement.module.css';
import { visibleSpicePosition } from './spicePlacementGeometry';
import { SPICE_RESERVE_PICKUP } from './spiceReserveDrop';
import { SpiceTokenPreview } from './SpiceTokenPreview';
import { tableDropPosition } from './tableDropPosition';

type Placement = { amount: number; factionId: string; position: Vector3Tuple };
type Change = { kind: 'pick-up'; placement: Placement } | { kind: 'move'; position: Vector3Tuple } | { kind: 'cancel' };
const footprint = createSpiceStack(0, 1);
const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
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
      const current = client.getTable();
      const bank = current?.snapshot.bank;
      if (
        !current?.canHandleTable ||
        !bank ||
        pointerSession.busy ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > bank.balance
      ) {
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
    const bank = table.snapshot.bank;
    if (!table.canHandleTable || bank?.factionId !== placement.factionId || bank.balance < placement.amount) {
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
    const bounds = renderer.domElement.getBoundingClientRect();
    const projected = new Vector3(...placement.position).project(camera);
    const clientX = bounds.left + ((projected.x + 1) * bounds.width) / 2 + dx * (fine ? 4 : 20);
    const clientY = bounds.top + ((1 - projected.y) * bounds.height) / 2 + dy * (fine ? 4 : 20);
    if (
      clientX < bounds.left + 32 ||
      clientX > bounds.right - 32 ||
      clientY < bounds.top + 32 ||
      clientY > bounds.bottom - 32
    ) {
      return;
    }
    const position = tableDropPosition({ clientX, clientY }, renderer.domElement, camera);
    if (!position) {
      return;
    }
    const supported = clampPositionToTable(footprint, position);
    if (Math.hypot(supported[0] - position[0], supported[2] - position[2]) > 1e-6) {
      return;
    }
    change({ kind: 'move', position });
  };
  const confirm = () => {
    const current = client.getTable();
    const bank = current?.snapshot.bank;
    if (current?.canHandleTable && bank?.factionId === placement.factionId && bank.balance >= placement.amount) {
      client.command({ kind: 'bank-withdraw', amount: placement.amount, position: placement.position });
    }
    finish();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      event.stopPropagation();
      return;
    }
    const direction = DIRECTIONS[event.key];
    if (direction || event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (direction) {
        move(direction[0], direction[1], event.shiftKey);
      } else if (event.key === 'Escape') {
        finish();
      } else if (!event.repeat) {
        confirm();
      }
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
