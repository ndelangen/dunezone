/* @jsxImportSource ./three-jsx */
import { useThree } from '@react-three/fiber/webgpu';
import { useEffect, useState } from 'react';

import { PhaseSymbol } from './PhaseSymbol';
import { useTableKeyboard } from './TableKeyboardContext';
import { useTabletopCommands, useTabletopSelector } from './TabletopContext';
import { SPICE_DISC_COLOR } from './tableTrackers';

export function SpiceBank({ radius }: Readonly<{ radius: number }>) {
  const enabled = useTabletopSelector((table) => table.canHandleTable && !table.state.draftMove);
  const { setHoveredPiece } = useTabletopCommands();
  const keyboard = useTableKeyboard();
  const { renderer } = useThree();
  const [hovered, setHovered] = useState(false);

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
  useEffect(() => () => keyboard.hoverSpiceBank(false), [keyboard]);

  return (
    <group>
      <PhaseSymbol symbol="/vector/icon/spice.svg" radius={radius} faceColor={SPICE_DISC_COLOR} />
      <mesh
        position={[0, 0.015, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerEnter={() => {
          setHovered(true);
          setHoveredPiece(null);
          keyboard.hoverSpiceBank(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
          keyboard.hoverSpiceBank(false);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <circleGeometry args={[radius, 96]} />
        <meshBasicMaterial transparent opacity={hovered && enabled ? 0.12 : 0} color="#ffb839" depthWrite={false} />
      </mesh>
    </group>
  );
}
