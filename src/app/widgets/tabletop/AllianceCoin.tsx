/* @jsxImportSource ./three-jsx */
import { FACTION_TOKEN_SCALE, TABLE_SURFACE_Y, TROOP_TOP_RADIUS } from '@shared/play/tableGeometry';

import { BOARD_RIM_COLOR, BOARD_RIM_METALNESS, BOARD_RIM_ROUGHNESS } from './boardRimGeometry';
import { SoftShadow } from './SoftShadow';

const TOKEN_RADIUS = TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE;
const CREAM = '#efe3c2';

function ignoreRaycast() {
  // Alliance marks are never an interaction target.
}

/*
 * Every faction token stands on a coin a band wider all round: in its ally's colour with the cream line the tokens carry inside their rim, or, standing alone, plain in the board rim's colour.
 * A token at its seat overhangs the board's rim and rests at the rim's height, so the coin stands on the table and rises to a little under the token, leaving the board's rim in view.
 * The coins of a large alliance share the width of two bands, so the ring never reaches the troop reserves behind the token or a neighbouring seat.
 */
const COIN_BAND = 0.085;
const MAX_BANDS = 2;
const MIN_HEIGHT = 0.018;
const DROP = 0.024;
const COIN_STEP = 0.003;
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
  const band = COIN_BAND * Math.min(1, MAX_BANDS / count);
  const radius = TOKEN_RADIUS + band * (index + 1);
  /* Each wider coin sits a step lower than the one above it; the widest is never thinner than MIN_HEIGHT. */
  const top = Math.max(TABLE_SURFACE_Y + MIN_HEIGHT + (count - 1 - index) * COIN_STEP, base - DROP - index * COIN_STEP);
  const height = top - TABLE_SURFACE_Y;
  return (
    <group position={[0, TABLE_SURFACE_Y, 0]}>
      <mesh raycast={ignoreRaycast} position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.006, height, 96]} />
        {color ? (
          <meshStandardMaterial color={color} roughness={0.56} metalness={0.1} />
        ) : (
          <meshStandardMaterial
            color={BOARD_RIM_COLOR}
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
