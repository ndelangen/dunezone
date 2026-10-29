import { Button } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { HelpMark } from '@ui/content/HelpMark';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';
import { useCallback, useEffect, useId, useReducer, useRef } from 'react';
import type { KeyboardEvent } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import styles from './KeyboardSpicePlacement.module.css';
import { moveSpicePosition, spicePreviewIsClear, visibleSpicePosition } from './spicePlacementGeometry';
import type { SpicePreviewSize } from './spicePlacementGeometry';
import { SPICE_RESERVE_PICKUP } from './spiceReserveDrop';
import { SpiceTokenPreview } from './SpiceTokenPreview';

type Placement = { amount: number; factionId: string; position: Vector3Tuple; size: SpicePreviewSize };
type Change =
  | { kind: 'pick-up'; placement: Placement }
  | { kind: 'move'; position: Vector3Tuple; size: SpicePreviewSize }
  | { kind: 'cancel' };
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
  return before && { ...before, position: change.position, size: change.size };
}

/* The inactive preview stays measurable so pickup checks the same compact control the player will see. */
function measurePreview(token: HTMLDialogElement | null): SpicePreviewSize | null {
  if (!token) {
    return null;
  }
  const bounds = token.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }
  return { width: bounds.width, height: bounds.height };
}

/** A keyboard pickup is only a preview; confirming its visible location sends the withdrawal. */
export function KeyboardSpicePlacement({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const { camera, renderer, invalidate } = useThree();
  const pointerSession = usePointerSession();
  const [placement, change] = useReducer(changePlacement, null);
  const source = useRef<HTMLElement | null>(null);
  const token = useRef<HTMLDialogElement | null>(null);
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
      const size = measurePreview(token.current);
      if (!size) {
        return;
      }
      const position = visibleSpicePosition(canvas, camera, size);
      if (!position) {
        return;
      }
      source.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      change({ kind: 'pick-up', placement: { amount, factionId: bank.factionId, position, size } });
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
  const visible = Boolean(
    placement && spicePreviewIsClear(renderer.domElement, camera, placement.position, placement.size)
  );
  useEffect(() => {
    if (!placement) {
      return;
    }
    const validate = () => {
      const size = measurePreview(token.current);
      if (!size) {
        finish();
        return;
      }
      if (!spicePreviewIsClear(renderer.domElement, camera, placement.position, size)) {
        finish();
        return;
      }
      const sameSize = size.width === placement.size.width && size.height === placement.size.height;
      if (!sameSize) {
        finish();
      }
    };
    const observer = new ResizeObserver(validate);
    observer.observe(renderer.domElement);
    if (token.current) {
      observer.observe(token.current);
    }
    for (const panel of document.querySelectorAll('[data-private-hand], [data-hides-cursor]')) {
      observer.observe(panel);
    }
    return () => observer.disconnect();
  }, [placement, table, renderer, camera, finish]);
  useEffect(() => {
    if (!active) {
      return;
    }
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', finish);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', finish);
    };
  }, [active, cancel, finish]);
  const focusPreview = useCallback(
    (node: HTMLButtonElement | null) => {
      if (visible) {
        node?.focus({ preventScroll: true });
      }
    },
    [visible]
  );
  const move = (dx: number, dy: number, fine: boolean) => {
    const size = measurePreview(token.current);
    if (!placement || !size) {
      return;
    }
    const step = fine ? 4 : 20;
    const position = moveSpicePosition(renderer.domElement, camera, placement.position, [dx * step, dy * step], size);
    if (position) {
      change({ kind: 'move', position, size });
    }
  };
  const confirm = () => {
    const size = measurePreview(token.current);
    if (!placement || !size) {
      return;
    }
    const clear = spicePreviewIsClear(renderer.domElement, camera, placement.position, size);
    if (clear && canPlaceSpice(client.getTable(), placement)) {
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
    } else if (!event.repeat && event.target instanceof HTMLButtonElement) {
      confirm();
    }
  };
  return (
    <Html
      position={placement?.position ?? [0, 0.18, 0]}
      center
      className={styles.overlay}
      zIndexRange={[40, 30]}
      /* The measurable Html wrapper must not intercept table drops while its dialog is hidden. */
      style={{ visibility: visible ? 'visible' : 'hidden', pointerEvents: visible ? 'auto' : 'none' }}
      /* Keep the inactive control measurable even when its anchor is behind the camera. */
      onOcclude={(behindCamera) => {
        if (behindCamera && active) {
          finish();
        }
      }}
    >
      <DarkSchemeIsland>
        <dialog
          ref={token}
          className={styles.placement}
          open
          data-takes-escape
          aria-label="Place spice on the table"
          aria-hidden={!visible || undefined}
          inert={!visible}
          style={{ visibility: visible ? 'visible' : 'hidden' }}
          onKeyDownCapture={keyDown}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              cancel();
            }
          }}
        >
          <Button
            ref={focusPreview}
            variant="transparent"
            p={0}
            w={64}
            h={64}
            aria-label={`Place ${placement?.amount ?? 0} spice here`}
            aria-describedby={instructionId}
            onClick={confirm}
          >
            <SpiceTokenPreview amount={placement?.amount ?? 0} />
          </Button>
          <div className={styles.help}>
            <HelpMark
              id={instructionId}
              text="Arrow keys move the spice. Hold Shift for smaller steps. Enter places it; Escape cancels."
            />
          </div>
        </dialog>
      </DarkSchemeIsland>
    </Html>
  );
}
