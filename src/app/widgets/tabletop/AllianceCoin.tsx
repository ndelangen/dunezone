/* @jsxImportSource ./three-jsx */

import { TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { playUiColors } from '@shared/uiPalette';

import { coinBand, coinRadius, coinTop } from './allianceCoinGeometry';
import { BOARD_RIM_METALNESS, BOARD_RIM_ROUGHNESS } from './boardRimGeometry';
import { ignoreRaycast } from './ignoreRaycast';
import { SoftShadow } from './SoftShadow';
import { useTablePalette } from './tablePalette';

/* The coin's colour: the ally's with the cream line the tokens carry inside their rim, or, standing alone, plain in the board rim's colour. */
const CREAM = playUiColors.allianceBand;

const SHADOW_SPREAD = 0.08;
const SHADOW_OPACITY = 0.75;

export type AllianceCoinProps = Readonly<{
  /* The ally's colour, or null for a faction standing alone. */
  color: string | null;
  /* This coin's place from the token outwards, and how many coins the token stands on. */
  index: number;
  count: number;
  /* The height the token rests at. */
  base: number;
}>;

/** One coin under a faction token, centred on the token's place on the table. */
export function AllianceCoin({ color, index, count, base }: AllianceCoinProps) {
  const palette = useTablePalette();
  const band = coinBand(count);
  const radius = coinRadius(index, count);
  const top = coinTop(index, count, base);
  const height = top - TABLE_SURFACE_Y;
  return (
    <group position={[0, TABLE_SURFACE_Y, 0]}>
      <mesh raycast={ignoreRaycast} position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.006, height, 96]} />
        {color ? (
          <meshStandardMaterial color={color} roughness={0.56} metalness={0.1} />
        ) : (
          <meshStandardMaterial
            color={palette.boardRim}
            roughness={BOARD_RIM_ROUGHNESS}
            metalness={BOARD_RIM_METALNESS}
          />
        )}
      </mesh>
      {color && (
        <mesh raycast={ignoreRaycast} position={[0, height + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - band * 0.42, radius - band * 0.3, 96]} />
          <meshStandardMaterial color={CREAM} roughness={0.6} metalness={0.05} />
        </mesh>
      )}
      <SoftShadow radius={radius - band} spread={SHADOW_SPREAD} y={height + 0.0016} opacity={SHADOW_OPACITY} />
      <SoftShadow radius={radius} spread={SHADOW_SPREAD} y={0.001} opacity={SHADOW_OPACITY} />
    </group>
  );
}
