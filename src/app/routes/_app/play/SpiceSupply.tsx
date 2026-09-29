/* @jsxImportSource ./three-jsx */
import { useThree } from '@react-three/fiber/webgpu';
import { useEffect, useState } from 'react';

import { usePresence } from './multiplayer/PresenceContext';
import { PhaseSymbol } from './PhaseSymbol';
import { useTableKeyboard } from './TableKeyboardContext';
import { useTabletop } from './TabletopContext';
import { SPICE_DISC_COLOR } from './tableTrackers';

export function SpiceSupply({ radius }: Readonly<{ radius: number }>) {
  const { setHoveredPiece, state } = useTabletop();
  const { canInteract } = usePresence();
  const keyboard = useTableKeyboard();
  const { renderer } = useThree();
  const [hovered, setHovered] = useState(false);
  const enabled = canInteract && !state.draftMove;

  useEffect(() => {
    if (!hovered || !enabled) {
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.cursor = 'pointer';
    return () => {
      canvas.style.cursor = 'default';
    };
  }, [enabled, hovered, renderer]);

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
