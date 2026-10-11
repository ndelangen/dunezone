/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { alliesOf } from '@shared/play/alliances';
import { factionTokenStackKey } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { FACTION_TOKEN_SCALE, TABLE_SURFACE_Y, TROOP_TOP_RADIUS } from '@shared/play/tableGeometry';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import {
  BOARD_RIM_COLOR,
  BOARD_RIM_METALNESS,
  BOARD_RIM_ROUGHNESS,
} from '../../../../widgets/tabletop/boardRimGeometry';
import { SoftShadow } from '../../../../widgets/tabletop/SoftShadow';

const TOKEN_RADIUS = TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE;
const CREAM = '#efe3c2';

function ignoreRaycast() {
  // Alliance marks are never an interaction target.
}

/*
 * Every faction token stands on a coin a band wider all round: in its ally's colour with the cream line the tokens carry inside their rim, or, standing alone, plain in the board rim's colour.
 * A token at its seat overhangs the board's rim and rests at the rim's height, so the coin stands on the table and rises to a little under the token, leaving the board's rim in view.
 */
const COIN_BAND = 0.085;
const MIN_HEIGHT = 0.018;
const DROP = 0.024;
const COIN_STEP = 0.003;
const SHADOW_SPREAD = 0.08;
const SHADOW_OPACITY = 0.75;
function Coin({ ally, index, count, base }: { ally: TablePiece | null; index: number; count: number; base: number }) {
  const radius = TOKEN_RADIUS + COIN_BAND * (index + 1);
  /* Each wider coin sits a step lower than the one above it; the widest is never thinner than MIN_HEIGHT. */
  const top = Math.max(TABLE_SURFACE_Y + MIN_HEIGHT + (count - 1 - index) * COIN_STEP, base - DROP - index * COIN_STEP);
  const height = top - TABLE_SURFACE_Y;
  return (
    <group position={[0, TABLE_SURFACE_Y, 0]}>
      <mesh raycast={ignoreRaycast} position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.006, height, 96]} />
        {ally ? (
          <meshStandardMaterial color={ally.color} roughness={0.56} metalness={0.1} />
        ) : (
          <meshStandardMaterial
            color={BOARD_RIM_COLOR}
            roughness={BOARD_RIM_ROUGHNESS}
            metalness={BOARD_RIM_METALNESS}
          />
        )}
      </mesh>
      {ally && (
        <mesh raycast={ignoreRaycast} position={[0, height + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - COIN_BAND * 0.42, radius - COIN_BAND * 0.3, 96]} />
          <meshStandardMaterial color={CREAM} roughness={0.6} metalness={0.05} />
        </mesh>
      )}
      <SoftShadow radius={radius - COIN_BAND} spread={SHADOW_SPREAD} y={height + 0.0016} opacity={SHADOW_OPACITY} />
      <SoftShadow radius={radius} spread={SHADOW_SPREAD} y={0.001} opacity={SHADOW_OPACITY} />
    </group>
  );
}

/** Under every faction's token, a coin in each ally's colour, or in the board rim's colour for a faction standing alone, so each seat shows at a glance who it is allied with. */
export function AllianceCoinsScene({ table }: { table: TableProjection }) {
  if (table.snapshot.stage !== 'play') {
    return null;
  }
  const alliances = table.snapshot.alliances;
  const token = (factionId: string) =>
    table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(factionId));
  const factions = table.snapshot.roster?.seats.flatMap(({ faction }) => (faction ? [faction.id] : [])) ?? [];
  return factions.flatMap((factionId) => {
    const own = token(factionId);
    if (!own) {
      return [];
    }
    const [x, y, z] = own.position;
    const allies = alliesOf(alliances, factionId).flatMap((ally) => {
      const piece = token(ally);
      return piece ? [piece] : [];
    });
    const coins = allies.length ? allies : [null];
    return [
      <group key={factionId} position={[x, 0, z]}>
        {coins.map((ally, index) => (
          <Coin key={ally?.id ?? 'alone'} ally={ally} index={index} count={coins.length} base={y} />
        ))}
      </group>,
    ];
  });
}
