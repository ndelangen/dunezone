/* @jsxImportSource ./three-jsx */
import { useThree } from '@react-three/fiber/webgpu';
import { useEffect, useState } from 'react';

import { usePresence } from './multiplayer/PresenceContext';
import { PhaseSymbol } from './PhaseSymbol';
import { useTableKeyboard } from './TableKeyboardContext';
import { useTableKeyboardVariant } from './tableKeyboardPrototype';
import { useTabletop } from './TabletopContext';
import { SPICE_DISC_COLOR } from './tableTrackers';

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target.matches('input, textarea, select');
}

function createSpiceKeyHandler(spawnSpice: (count: number) => void) {
  return (event: KeyboardEvent) => {
    if ([event.metaKey, event.ctrlKey, event.altKey, event.shiftKey].some(Boolean)) {
      return;
    }
    if (isEditingTarget(event.target)) {
      return;
    }
    if (!/^[0-9]$/.test(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) {
      spawnSpice(event.key === '0' ? 10 : Number(event.key));
    }
  };
}

export function SpiceSupply({ radius }: Readonly<{ radius: number }>) {
  const { spawnSpice, setHoveredPiece, state } = useTabletop();
  const { canInteract } = usePresence();
  const keyboard = useTableKeyboard();
  /* PROTOTYPE, #1323 F29: only variant A keeps the disc's own listener; B and C tell the keyboard owner about the hover. */
  const variant = useTableKeyboardVariant();
  const { renderer } = useThree();
  const [hovered, setHovered] = useState(false);
  const enabled = canInteract && !state.draftMove;

  useEffect(() => {
    if (!hovered || !enabled) {
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.cursor = 'pointer';
    const keyDown = variant === 'a' ? createSpiceKeyHandler(spawnSpice) : null;
    if (keyDown) {
      window.addEventListener('keydown', keyDown, true);
    }
    return () => {
      if (keyDown) {
        window.removeEventListener('keydown', keyDown, true);
      }
      canvas.style.cursor = 'default';
    };
  }, [enabled, hovered, renderer, spawnSpice, variant]);

  /* A disc that unmounts under the pointer hears no leave, so it lets go of the hover itself. */
  useEffect(() => () => keyboard.hoverSupply(false), [keyboard]);

  return (
    <group>
      <PhaseSymbol symbol="/vector/icon/spice.svg" radius={radius} faceColor={SPICE_DISC_COLOR} />
      <mesh
        position={[0, 0.015, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerEnter={() => {
          setHovered(true);
          setHoveredPiece(null);
          keyboard.hoverSupply(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
          keyboard.hoverSupply(false);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <circleGeometry args={[radius, 96]} />
        <meshBasicMaterial transparent opacity={hovered && enabled ? 0.12 : 0} color="#ffb839" depthWrite={false} />
      </mesh>
    </group>
  );
}
