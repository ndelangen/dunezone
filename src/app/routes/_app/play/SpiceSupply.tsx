/* @jsxImportSource ./three-jsx */
import { useThree } from '@react-three/fiber/webgpu';
import { useEffect, useState } from 'react';

import { usePresence } from './multiplayer/PresenceContext';
import { PhaseSymbol } from './PhaseSymbol';
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
  const { renderer } = useThree();
  const [hovered, setHovered] = useState(false);
  const enabled = canInteract && !state.draftMove;

  useEffect(() => {
    if (!hovered || !enabled) {
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.cursor = 'pointer';
    const clear = () => setHovered(false);
    const keyDown = createSpiceKeyHandler(spawnSpice);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    canvas.addEventListener('pointerleave', clear);
    return () => {
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      canvas.removeEventListener('pointerleave', clear);
      canvas.style.cursor = 'default';
    };
  }, [enabled, hovered, renderer, spawnSpice]);

  return (
    <group>
      <PhaseSymbol symbol="/vector/icon/spice.svg" radius={radius} faceColor={SPICE_DISC_COLOR} />
      <mesh
        position={[0, 0.015, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerEnter={() => {
          setHovered(true);
          setHoveredPiece(null);
        }}
        onPointerLeave={() => setHovered(false)}
        onClick={(event) => event.stopPropagation()}
      >
        <circleGeometry args={[radius, 96]} />
        <meshBasicMaterial transparent opacity={hovered && enabled ? 0.12 : 0} color="#ffb839" depthWrite={false} />
      </mesh>
    </group>
  );
}
